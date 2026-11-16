alter table public.payment_attempts
  add column circle_sdk_result_state text,
  add column circle_sdk_steps jsonb not null default '[]'::jsonb,
  add constraint payment_attempts_circle_sdk_result_state_check
    check (circle_sdk_result_state is null or circle_sdk_result_state in ('pending', 'success', 'error')),
  add constraint payment_attempts_circle_sdk_steps_check
    check (jsonb_typeof(circle_sdk_steps) = 'array' and jsonb_array_length(circle_sdk_steps) <= 64);

create function public.record_circle_sdk_progress(
  p_token_hash text,
  p_attempt_id uuid,
  p_result_state text,
  p_step jsonb default null
) returns setof public.payment_attempts
language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.payment_attempts%rowtype;
  v_step jsonb;
  v_step_name text;
  v_step_state text;
  v_tx_hash text;
  v_steps jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_result_state is null or p_result_state not in ('pending', 'success', 'error') then
    raise exception 'invalid_circle_sdk_progress' using errcode = '22023';
  end if;

  if p_step is not null then
    if jsonb_typeof(p_step) is distinct from 'object'
      or jsonb_typeof(p_step->'name') is distinct from 'string'
      or jsonb_typeof(p_step->'state') is distinct from 'string'
      or length(p_step->>'name') not between 1 and 80
      or p_step->>'name' !~ '^[A-Za-z][A-Za-z0-9 _-]{0,79}$'
      or p_step->>'state' not in ('pending', 'success', 'error', 'noop')
      or (p_step ? 'txHash' and (jsonb_typeof(p_step->'txHash') is distinct from 'string'
        or p_step->>'txHash' !~ '^0x[0-9a-fA-F]{64}$'))
      or (p_step ? 'errorCategory' and (jsonb_typeof(p_step->'errorCategory') is distinct from 'string'
        or p_step->>'errorCategory' !~ '^[a-z_]{1,40}$'))
      or (p_step ? 'forwarded' and jsonb_typeof(p_step->'forwarded') is distinct from 'boolean')
      or (p_step ? 'batched' and jsonb_typeof(p_step->'batched') is distinct from 'boolean') then
      raise exception 'invalid_circle_sdk_step' using errcode = '22023';
    end if;

    v_step_name := p_step->>'name';
    v_step_state := p_step->>'state';
    v_tx_hash := p_step->>'txHash';
    v_step := jsonb_strip_nulls(jsonb_build_object(
      'name', v_step_name,
      'state', v_step_state,
      'txHash', case when v_tx_hash is null then null else lower(v_tx_hash) end,
      'errorCategory', p_step->>'errorCategory',
      'forwarded', case when p_step ? 'forwarded' then (p_step->>'forwarded')::boolean else null end,
      'batched', case when p_step ? 'batched' then (p_step->>'batched')::boolean else null end
    ));
  end if;

  select pa.* into v_attempt
  from public.payment_attempts pa
  join public.invoices i on i.id = pa.invoice_id
  where pa.id = p_attempt_id and pa.mode = 'live'
    and pa.circle_execution_reserved_at is not null
    and pa.status in ('PROCESSING', 'KNOWN_DEPOSIT_TX')
    and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
  for update of pa;
  if not found then raise exception 'attempt_unavailable' using errcode = 'P0002'; end if;

  if v_step_name = 'approve' and v_tx_hash is not null
    and v_attempt.circle_approval_tx_hash is not null
    and lower(v_attempt.circle_approval_tx_hash) <> lower(v_tx_hash) then
    raise exception 'approval_reference_already_recorded' using errcode = '22023';
  end if;
  if v_step_name in ('burn', 'depositForBurn') and v_tx_hash is not null
    and v_attempt.transaction_hash is not null
    and lower(v_attempt.transaction_hash) <> lower(v_tx_hash) then
    raise exception 'source_burn_reference_already_recorded' using errcode = '22023';
  end if;

  v_steps := v_attempt.circle_sdk_steps;
  if v_step is not null and not (v_steps @> jsonb_build_array(v_step)) then
    if jsonb_array_length(v_steps) >= 64 then
      select coalesce(jsonb_agg(item.value order by item.ordinality), '[]'::jsonb) into v_steps
      from jsonb_array_elements(v_steps) with ordinality as item(value, ordinality)
      where item.ordinality > jsonb_array_length(v_attempt.circle_sdk_steps) - 63;
    end if;
    v_steps := v_steps || jsonb_build_array(v_step);
  end if;

  return query update public.payment_attempts set
    circle_sdk_result_state = p_result_state,
    circle_sdk_steps = v_steps,
    circle_approval_tx_hash = case when v_step_name = 'approve' and v_tx_hash is not null
      then coalesce(circle_approval_tx_hash, lower(v_tx_hash)) else circle_approval_tx_hash end,
    transaction_hash = case when v_step_name in ('burn', 'depositForBurn') and v_tx_hash is not null
      then coalesce(transaction_hash, lower(v_tx_hash)) else transaction_hash end,
    status = case when v_step_name in ('burn', 'depositForBurn') and v_tx_hash is not null
      then 'KNOWN_DEPOSIT_TX'::public.payment_attempt_status else status end,
    circle_recovery_state = case when v_step_name in ('burn', 'depositForBurn') and v_tx_hash is not null
      then 'SOURCE_CANDIDATE' else circle_recovery_state end,
    circle_recovery_updated_at = statement_timestamp()
  where id = p_attempt_id
  returning *;
end;
$$;

revoke all on function public.record_circle_sdk_progress(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_circle_sdk_progress(text, uuid, text, jsonb) to service_role;
