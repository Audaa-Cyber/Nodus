import test from "node:test";
import assert from "node:assert/strict";
import { getPaymentMode, getTidepoolConfiguration } from "../src/lib/server/tidepool-config.ts";

const validTestEnv = {
  PAYMENT_MODE: "tidepool_testnet",
  SUPABASE_ENVIRONMENT: "tidepool_testnet",
  TIDEPOOL_TEST_PROJECT_REF: "nodustestprojectref123456",
  SUPABASE_PRODUCTION_PROJECT_REF: "nodusproductionprojectref123456",
  NEXT_PUBLIC_SUPABASE_URL: "https://nodustestprojectref123456.supabase.co",
  TIDEPOOL_API_BASE_URL: "https://www.usetidepool.tech",
  TIDEPOOL_DEPOSITS_ENABLED: "false",
  TIDEPOOL_QUOTE_SIGNATURE_VERIFICATION: "unconfirmed",
};

test("mock remains the default payment mode", () => {
  assert.equal(getPaymentMode({}), "mock");
  assert.equal(getPaymentMode({ PAYMENT_MODE: "mock" }), "mock");
});

test("the existing production live mode remains a distinct mode", () => {
  assert.equal(getPaymentMode({ PAYMENT_MODE: "live" }), "live");
});

test("unknown payment modes fail closed", () => {
  assert.throws(() => getPaymentMode({ PAYMENT_MODE: "typo" }), /unsupported_payment_mode/);
});

test("Tidepool config requires its explicit isolated Supabase project", () => {
  assert.throws(
    () => getTidepoolConfiguration({ ...validTestEnv, SUPABASE_ENVIRONMENT: "production" }),
    /tidepool_test_database_required/,
  );
  assert.throws(
    () => getTidepoolConfiguration({ ...validTestEnv, NEXT_PUBLIC_SUPABASE_URL: "https://production.supabase.co" }),
    /tidepool_test_database_project_mismatch/,
  );
  assert.throws(
    () => getTidepoolConfiguration({ ...validTestEnv, TIDEPOOL_TEST_PROJECT_REF: validTestEnv.SUPABASE_PRODUCTION_PROJECT_REF }),
    /tidepool_test_project_is_production/,
  );
});

test("Tidepool API base cannot be redirected to another provider", () => {
  assert.throws(
    () => getTidepoolConfiguration({ ...validTestEnv, TIDEPOOL_API_BASE_URL: "https://1click.chaindefuser.com" }),
    /tidepool_api_origin_mismatch/,
  );
});

test("Tidepool mode refuses production live-payment enablement", () => {
  assert.throws(
    () => getTidepoolConfiguration({ ...validTestEnv, LIVE_PAYMENT_ENABLED: "true" }),
    /production_live_payments_must_remain_disabled/,
  );
});

test("deposits remain disabled until signature verification is explicitly confirmed", () => {
  const config = getTidepoolConfiguration({ ...validTestEnv, TIDEPOOL_DEPOSITS_ENABLED: "true" });
  assert.equal(config.depositsEnabled, false);
});

test("environment toggles cannot enable deposits before the flow is implemented", () => {
  const config = getTidepoolConfiguration({
    ...validTestEnv,
    TIDEPOOL_DEPOSITS_ENABLED: "true",
    TIDEPOOL_QUOTE_SIGNATURE_VERIFICATION: "confirmed",
    TIDEPOOL_MAKER_PUBLIC_KEY: "ed25519:operator-confirmed-key",
  });
  assert.equal(config.depositsEnabled, false);
});
