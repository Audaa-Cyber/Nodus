export async function register() {
  // Production uses the authenticated scheduled endpoints, not process timers.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "development") return;
  if (!process.env.NEAR_SIGNER_PRIVATE_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const state = globalThis as typeof globalThis & { nodusNearWorkerStop?: () => void };
  if (state.nodusNearWorkerStop) return;
  const { startNearLocalWorker } = await import("./lib/payments/near-local-worker");
  state.nodusNearWorkerStop = startNearLocalWorker({
    registerInvoices: async () => {
      const { processNearInvoiceRegistrationOutbox } = await import("./lib/server/near-invoice-registration-outbox");
      return processNearInvoiceRegistrationOutbox(5);
    },
    settlePayments: async () => {
      const { processNearSettlementOutbox } = await import("./lib/server/near-settlement-outbox");
      return processNearSettlementOutbox(5);
    },
    report: (queue, result) => {
      if (result === "error") console.error(JSON.stringify({ event: "near_local_worker", queue, result }));
    },
    schedule: (callback, delay) => {
      const timer = setTimeout(callback, delay);
      timer.unref();
      return () => clearTimeout(timer);
    },
  });
}
