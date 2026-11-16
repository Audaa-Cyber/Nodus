import "server-only";

import { Account } from "@near-js/accounts";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { actionCreators } from "@near-js/transactions";

const NETWORK = "testnet";
const DEFAULT_RPC = "https://rpc.testnet.near.org";
const GAS = 30_000_000_000_000n;
const CONTRACT_METHODS = new Set([
  "get_invoice", "register_invoice", "get_attempt", "register_attempt", "get_settlement", "attest_settlement",
  "attest_settlement_v2",
]);

export type NearSettlementClient = ReturnType<typeof createNearSettlementClient>;

export function createNearSettlementClient() {
  if (process.env.NEAR_NETWORK_ID !== NETWORK) throw new Error("near_testnet_only_configuration_required");
  const rpcUrl = process.env.NEAR_RPC_URL || DEFAULT_RPC;
  const url = new URL(rpcUrl);
  if (url.protocol !== "https:" || url.hostname !== "rpc.testnet.near.org") throw new Error("near_testnet_rpc_required");
  const contractId = process.env.NEAR_CONTRACT_ID || "noduss.testnet";
  const signerId = process.env.NEAR_SIGNER_ACCOUNT_ID;
  const secret = process.env.NEAR_SIGNER_PRIVATE_KEY;
  if (!contractId.endsWith(".testnet") || !signerId?.endsWith(".testnet") || !secret?.startsWith("ed25519:")) {
    throw new Error("near_testnet_signer_configuration_missing");
  }
  const provider = new JsonRpcProvider({ url: rpcUrl });
  const signer = KeyPairSigner.fromSecretKey(secret as `ed25519:${string}`);
  const account = new Account(signerId, provider, signer);
  const ready = provider.getNetworkId().then((networkId) => {
    if (networkId !== NETWORK) throw new Error("near_rpc_network_mismatch");
  });
  const view = async <T>(method: string, args: Record<string, unknown>): Promise<T | null> => {
    if (!CONTRACT_METHODS.has(method) || !method.startsWith("get_")) throw new Error("near_view_method_not_allowed");
    await ready;
    return ((await provider.callFunction(contractId, method, args)) as T | undefined) ?? null;
  };
  const call = async (method: string, args: Record<string, unknown>): Promise<string> => {
    if (!CONTRACT_METHODS.has(method) || method.startsWith("get_")) throw new Error("near_change_method_not_allowed");
    await ready;
    try {
      const outcome = await account.signAndSendTransaction({
        receiverId: contractId,
        actions: [actionCreators.functionCall(method, args, GAS, 0n)],
        waitUntil: "FINAL",
        throwOnFailure: true,
      });
      return outcome.transaction.hash;
    } catch (error) {
      if (isNearPermanentError(error)) {
        const permanent = new Error("near_contract_call_rejected") as Error & { code: string; permanent: true };
        permanent.code = "near_contract_call_rejected";
        permanent.permanent = true;
        throw permanent;
      }
      throw error;
    }
  };
  return { contractId, view, call };
}

export function isNearPermanentError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists|_already_attested|duplicate|mismatch|invalid|unauthorized|not authorized|attestor_not_found|invoice_not_found|attempt_not_found|unknown variant/i.test(message);
}
