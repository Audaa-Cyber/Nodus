/** Development recovery loop. Database leases remain authoritative across processes. */
export function startNearLocalWorker(input: {
  registerInvoices: () => Promise<unknown>;
  settlePayments: () => Promise<unknown>;
  report: (queue: string, result: "ok" | "error") => void;
  schedule: (callback: () => void, delay: number) => () => void;
  intervalMs?: number;
}) {
  let stopped = false;
  let cancel: (() => void) | undefined;
  const tick = async () => {
    for (const [queue, run] of [
      ["invoice_registration", input.registerInvoices],
      ["settlement", input.settlePayments],
    ] as const) {
      if (stopped) return;
      try { await run(); input.report(queue, "ok"); }
      catch { input.report(queue, "error"); }
    }
    // Schedule after completion: slow RPC calls must never overlap local ticks.
    if (!stopped) cancel = input.schedule(() => { void tick(); }, input.intervalMs ?? 30_000);
  };
  cancel = input.schedule(() => { void tick(); }, 0);
  return () => { stopped = true; cancel?.(); };
}
