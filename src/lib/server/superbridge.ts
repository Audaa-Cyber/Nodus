import {
  createClient,
  RouteId,
  type SuperbridgeSdk,
  type GetRoutesRequest,
  type RouteResponse,
  type RouteError,
  type Activity,
  type InitiatingTransactionEvmDto,
  type RouteAction,
} from "@superbridge/sdk";

let cachedClient: SuperbridgeSdk | null = null;

export function getSuperbridgeClient(): SuperbridgeSdk | null {
  const apiKey = process.env.SUPERBRIDGE_API_KEY?.trim();
  if (!apiKey) return null;
  if (!cachedClient) {
    cachedClient = createClient({ apiKey });
  }
  return cachedClient;
}

export function isSuperbridgeConfigured(): boolean {
  return Boolean(process.env.SUPERBRIDGE_API_KEY?.trim());
}

export interface SuperbridgeRouteQuery {
  fromChainId: string;
  toChainId: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  sender?: string;
  recipient: string;
  slippage?: number;
}

export async function fetchSuperbridgeRoutes(
  query: SuperbridgeRouteQuery,
): Promise<{ success: true; routes: RouteResponse } | { success: false; error: string }> {
  const client = getSuperbridgeClient();
  if (!client) {
    return { success: false, error: "superbridge_not_configured" };
  }

  try {
    const params: GetRoutesRequest = {
      fromChainId: query.fromChainId,
      toChainId: query.toChainId,
      fromTokenAddress: query.fromTokenAddress,
      toTokenAddress: query.toTokenAddress,
      amount: query.amount,
      sender: query.sender,
      recipient: query.recipient,
      slippage: query.slippage ?? 0.005, // 0.5% default slippage
    };

    const response = await client.getRoutes(params);

    if ("type" in response && typeof (response as RouteError).type === "string") {
      const err = response as RouteError;
      return { success: false, error: `superbridge_error: ${err.type}` };
    }

    return { success: true, routes: response as RouteResponse };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_superbridge_error";
    return { success: false, error: message };
  }
}

export async function fetchSuperbridgeStepTransaction(params: {
  id: string;
  submitter: string;
  action: RouteAction;
}): Promise<InitiatingTransactionEvmDto | null> {
  const client = getSuperbridgeClient();
  if (!client) return null;

  try {
    const result = await client.getStepTransaction({
      id: params.id,
      submitter: params.submitter,
      action: params.action,
    });
    return result as InitiatingTransactionEvmDto;
  } catch {
    return null;
  }
}

export async function fetchSuperbridgeActivity(params: {
  txHash?: string;
  address?: string;
  type?: "mainnet" | "testnet";
}): Promise<Activity[]> {
  const client = getSuperbridgeClient();
  if (!client) return [];

  try {
    return await client.getActivity({
      txHash: params.txHash,
      address: params.address,
      type: params.type,
      pageSize: 10,
    });
  } catch {
    return [];
  }
}

export async function indexSuperbridgeTransaction(params: {
  routeId?: string;
  chainUid?: string;
  txHash: string;
}): Promise<boolean> {
  const client = getSuperbridgeClient();
  if (!client) return false;

  try {
    const routeId = (params.routeId && params.routeId in RouteId
      ? params.routeId
      : RouteId.Cctp) as RouteId;
    await client.indexTransaction({
      routeId,
      chainUid: params.chainUid,
      txHash: params.txHash,
    });
    return true;
  } catch {
    return false;
  }
}
