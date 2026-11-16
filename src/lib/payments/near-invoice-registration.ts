export type NearInvoiceTerms = {
  currency: string;
  amount_minor: string;
  destination_chain_id: number;
  token_decimals: number;
  token_address: string;
  merchant_recipient: string;
};

export type NearInvoiceArgs = { invoice_id: string; terms: NearInvoiceTerms };
export type NearInvoiceRegistrationJob = { id: string; invoice_id: string; lock_token: string };

export class PermanentNearInvoiceRegistrationError extends Error {
  readonly permanent = true;
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; this.name = "PermanentNearInvoiceRegistrationError"; }
}

function matches(args: NearInvoiceArgs, record: Record<string, unknown> | null): boolean {
  if (!record) return false;
  const terms = record.terms as Record<string, unknown> | undefined;
  return record.invoice_id === args.invoice_id && !!terms
    && String(terms.currency).toUpperCase() === args.terms.currency
    && String(terms.amount_minor) === args.terms.amount_minor
    && Number(terms.destination_chain_id) === args.terms.destination_chain_id
    && Number(terms.token_decimals) === args.terms.token_decimals
    && String(terms.token_address).toLowerCase() === args.terms.token_address.toLowerCase()
    && String(terms.merchant_recipient).toLowerCase() === args.terms.merchant_recipient.toLowerCase();
}

export async function deliverNearInvoiceRegistration(
  job: NearInvoiceRegistrationJob,
  args: NearInvoiceArgs,
  existingTransactionHash: string | null,
  dependencies: {
    getInvoice: (invoiceId: string) => Promise<Record<string, unknown> | null>;
    registerInvoice: (args: NearInvoiceArgs) => Promise<string>;
    markSubmitted: (job: NearInvoiceRegistrationJob, transactionHash: string) => Promise<void>;
    markRegistered: (job: NearInvoiceRegistrationJob, transactionHash: string | null, invoiceReference: string) => Promise<void>;
    retry: (job: NearInvoiceRegistrationJob, code: string) => Promise<void>;
    fail: (job: NearInvoiceRegistrationJob, code: string) => Promise<void>;
  },
): Promise<"registered" | "retry" | "failed"> {
  try {
    let record = await dependencies.getInvoice(args.invoice_id);
    let transactionHash = existingTransactionHash;
    if (!record) {
      transactionHash = await dependencies.registerInvoice(args);
      await dependencies.markSubmitted(job, transactionHash);
      record = await dependencies.getInvoice(args.invoice_id);
    }
    if (!record) throw new Error("near_invoice_readback_unavailable");
    if (!matches(args, record)) throw new PermanentNearInvoiceRegistrationError("near_invoice_registry_mismatch");
    await dependencies.markRegistered(job, transactionHash, args.invoice_id);
    return "registered";
  } catch (error) {
    if (error instanceof PermanentNearInvoiceRegistrationError
      || Boolean(error && typeof error === "object" && "permanent" in error && error.permanent === true)) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "near_invoice_registration_rejected";
      try {
        const recovered = await dependencies.getInvoice(args.invoice_id);
        if (matches(args, recovered)) {
          await dependencies.markRegistered(job, existingTransactionHash, args.invoice_id);
          return "registered";
        }
      } catch {
        await dependencies.retry(job, "near_invoice_readback_unavailable");
        return "retry";
      }
      await dependencies.fail(job, code);
      return "failed";
    }
    await dependencies.retry(job, "near_invoice_registration_unverified");
    return "retry";
  }
}
