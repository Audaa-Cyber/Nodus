export type PaymentMode = "mock" | "live" | "tidepool_testnet";

export type TidepoolConfiguration = {
  apiBaseUrl: "https://www.usetidepool.tech";
  testProjectRef: string;
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
  if (env.SUPABASE_ENVIRONMENT !== "tidepool_testnet") throw new Error("tidepool_test_database_required");

  const projectRef = env.TIDEPOOL_TEST_PROJECT_REF?.trim();
  if (!projectRef || !/^[a-z0-9-]+$/.test(projectRef)) throw new Error("tidepool_test_project_ref_missing");
  const productionProjectRef = env.SUPABASE_PRODUCTION_PROJECT_REF?.trim();
  if (!productionProjectRef || !/^[a-z0-9-]+$/.test(productionProjectRef)) {
    throw new Error("production_project_ref_required_for_testnet");
  }
  if (projectRef === productionProjectRef) throw new Error("tidepool_test_project_is_production");

  let projectUrl: URL;
  try {
    projectUrl = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  } catch {
    throw new Error("tidepool_test_database_url_invalid");
  }
  if (projectUrl.protocol !== "https:" || projectUrl.hostname !== `${projectRef}.supabase.co`
    || projectUrl.username || projectUrl.password || projectUrl.port || projectUrl.pathname !== "/"
    || projectUrl.search || projectUrl.hash) {
    throw new Error("tidepool_test_database_project_mismatch");
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
    testProjectRef: projectRef,
    depositsEnabled,
  };
}
