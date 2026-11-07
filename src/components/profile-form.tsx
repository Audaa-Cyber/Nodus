"use client";

import { useActionState } from "react";
import { updateBusinessProfileAction } from "@/app/actions/profile";
import type { FormState } from "@/app/actions/auth";

export default function ProfileForm({ businessName, receivingNetwork, receivingAddress }: {
  businessName: string;
  receivingNetwork: string | null;
  receivingAddress: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateBusinessProfileAction, {});
  return (
    <form action={action} className="business-form profile-form">
      <label>Business name<input name="businessName" required maxLength={120} defaultValue={businessName} /></label>
      <fieldset>
        <legend>Receiving destination</legend>
        <p className="wallet-description">Saved for future payment quotes. A configured destination does not mean this network or route is live or verified.</p>
        <label>Network identifier<input name="receivingNetwork" maxLength={64} defaultValue={receivingNetwork ?? ""} placeholder="For example: base" autoComplete="off" /></label>
        <label>Wallet address<input name="receivingAddress" maxLength={256} defaultValue={receivingAddress ?? ""} placeholder="Address on the selected network" autoComplete="off" /></label>
      </fieldset>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {state.success && <p className="form-success" role="status">{state.success}</p>}
      <button className="button button-dark" type="submit" disabled={pending}>
        {pending && <span className="button-spinner" aria-hidden="true" />}
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
