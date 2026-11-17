type Scheduler = {
  now: () => number;
  request: (callback: (time: number) => void) => number;
  cancel: (id: number) => void;
  delay: (callback: () => void, ms: number) => number;
  clear: (id: number) => void;
};

export function createIntegerAnimator(options: {
  value: bigint; identity: string; duration: number;
  onValue: (value: bigint) => void; onChange: (active: boolean) => void;
  scheduler: Scheduler;
}) {
  let current = options.value;
  let target = current;
  let identity = options.identity;
  let frame: number | undefined;
  let timer: number | undefined;
  const { scheduler, onValue, onChange } = options;
  const stop = () => {
    if (frame !== undefined) scheduler.cancel(frame);
    if (timer !== undefined) scheduler.clear(timer);
    frame = timer = undefined;
  };
  return {
    update(value: bigint, nextIdentity: string, reduced: boolean, countFromZero = false) {
      if (identity === nextIdentity && target === value && !reduced) return;
      const replay = identity !== nextIdentity && countFromZero;
      const changed = (identity === nextIdentity && target !== value) || replay;
      stop();
      identity = nextIdentity;
      target = value;
      if (!changed || reduced) {
        current = value;
        onValue(value);
        onChange(false);
        return;
      }
      if (replay) {
        current = 0n;
        onValue(0n);
      }
      const from = current;
      const startedAt = scheduler.now();
      onChange(true);
      const tick = (time: number) => {
        const progress = Math.min(1, Math.max(0, (time - startedAt) / options.duration));
        // Hover counts advance steadily in readable 100ms steps. Other data
        // updates keep their existing easing. Financial base units stay exact.
        const fraction = countFromZero
          ? progress === 1 ? 1 : Math.floor(Math.max(0, time - startedAt) / 100) * 100 / options.duration
          : 1 - (1 - progress) ** 3;
        const eased = BigInt(Math.round(fraction * 1_000_000));
        current = progress === 1 ? target : from + (target - from) * eased / 1_000_000n;
        onValue(current);
        frame = progress < 1 ? scheduler.request(tick) : undefined;
      };
      frame = scheduler.request(tick);
      timer = scheduler.delay(() => { timer = undefined; onChange(false); }, Math.max(1200, options.duration));
    },
    dispose: stop,
  };
}

// Successful server snapshots are authoritative. Null represents a failed fetch,
// not an empty list. Keep seen IDs across list truncation and repeated refreshes.
export function createSnapshotTracker(mode: "paid" | "arrival") {
  const seen = new Map<string, string | undefined>();
  let initialized = false;
  return {
    update(rows: readonly { id: string; status?: string }[] | null) {
      if (!rows) return [];
      const changed: string[] = [];
      for (const row of rows) {
        if (initialized && (mode === "arrival"
          ? !seen.has(row.id)
          : seen.has(row.id) && seen.get(row.id) !== "paid" && row.status === "paid")) {
          changed.push(row.id);
        }
        seen.set(row.id, row.status);
      }
      initialized = true;
      if (seen.size > 500) {
        const oldest = seen.keys().next().value;
        if (oldest) seen.delete(oldest);
      }
      return changed;
    },
  };
}
