export type PaymentMode = "mock" | "live" | "tidepool_testnet";

export type TidepoolConfiguration = {
  apiBaseUrl: "https://www.usetidepool.tech";
  depositsEnabled: boolean;
};

type Environment = Record<string, string | undefined>;

const TIDEPOOL_API_ORIGIN = "https://www.usetidepool.tech";
// Keep false until quote verification, wallet submission, and testnet settlement
// verification are implemented and reviewed. Environment toggles alone cannot unlock it.
const TIDEPOOL_DEPOSIT_FLOW_IMPLEMENTED = false;

/** Fail closed on typos so an unknown mode can never silently fall through to live. */
export function getPaymentMode(env: Environment = process.env): PaymentMode {
  const value = env.PAYMENT_MODE ?? "mock";
  if (value === "mock" || value === "live" || value === "tidepool_testnet") return value;
  throw new Error("unsupported_payment_mode");
}

/**
 * Validates the explicit Tidepool/test database boundary.
 * Credentials are deliberately not returned from this function.
 */
export function getTidepoolConfiguration(env: Environment = process.env): TidepoolConfiguration {
  if (getPaymentMode(env) !== "tidepool_testnet") throw new Error("tidepool_testnet_mode_required");
  if (env.LIVE_PAYMENT_ENABLED === "true") throw new Error("production_live_payments_must_remain_disabled");
  if (env.SUPABASE_ENVIRONMENT !== "tidepool_testnet_local") throw new Error("tidepool_local_database_required");

  let projectUrl: URL;
  try {
    projectUrl = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  } catch {
    throw new Error("tidepool_local_database_url_invalid");
  }
  if (projectUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(projectUrl.hostname)
    || projectUrl.port !== "54321"
    || projectUrl.username || projectUrl.password || projectUrl.pathname !== "/"
    || projectUrl.search || projectUrl.hash) {
    throw new Error("tidepool_local_database_must_use_loopback");
  }

  const configuredOrigin = env.TIDEPOOL_API_BASE_URL?.trim() || TIDEPOOL_API_ORIGIN;
  if (configuredOrigin !== TIDEPOOL_API_ORIGIN) throw new Error("tidepool_api_origin_mismatch");

  const signatureReady = env.TIDEPOOL_QUOTE_SIGNATURE_VERIFICATION === "confirmed"
    && Boolean(env.TIDEPOOL_MAKER_PUBLIC_KEY?.trim());
  const depositsEnabled = TIDEPOOL_DEPOSIT_FLOW_IMPLEMENTED
    && env.TIDEPOOL_DEPOSITS_ENABLED === "true"
    && signatureReady;

  return {
    apiBaseUrl: TIDEPOOL_API_ORIGIN,
    depositsEnabled,
  };
}
