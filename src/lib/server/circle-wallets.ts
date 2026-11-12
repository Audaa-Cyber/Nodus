import "server-only";
import {
  CircleUserControlledWalletsClient,
  Blockchain,
  type Wallet,
  type Challenge,
  type TokenBlockchain,
} from "@circle-fin/user-controlled-wallets";

let cachedClient: CircleUserControlledWalletsClient | null = null;

export function isCircleWalletsConfigured(): boolean {
  return Boolean(process.env.CIRCLE_API_KEY && process.env.CIRCLE_API_KEY.trim() !== "");
}

export function getCircleAppId(): string | null {
  return (
    process.env.NEXT_PUBLIC_CIRCLE_APP_ID ||
    process.env.CIRCLE_APP_ID ||
    null
  );
}

export function getCircleWalletsClient(): CircleUserControlledWalletsClient {
  const apiKey = process.env.CIRCLE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("CIRCLE_API_KEY is not configured on the server.");
  }
  if (!cachedClient) {
    const baseUrl = process.env.CIRCLE_API_BASE_URL?.trim() || "https://api.circle.com";
    cachedClient = new CircleUserControlledWalletsClient({
      apiKey,
      baseUrl,
    });
  }
  return cachedClient;
}

export interface UserTokenSession {
  userToken: string;
  encryptionKey: string;
}

/**
 * Creates or retrieves a user session token for a given user identifier.
 * Protects Circle credentials by staying strictly server-side.
 */
export async function getOrCreateCircleUserToken(userId: string): Promise<UserTokenSession> {
  const client = getCircleWalletsClient();
  try {
    const response = await client.createUserToken({ userId });
    const data = response.data;
    if (data?.userToken && data?.encryptionKey) {
      return {
        userToken: data.userToken,
        encryptionKey: data.encryptionKey,
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Cannot find the userId") || message.includes("not found")) {
      try {
        await client.createUser({ userId });
      } catch (createErr: unknown) {
        const createMsg = createErr instanceof Error ? createErr.message : String(createErr);
        if (!createMsg.includes("already created")) {
          throw createErr;
        }
      }
      const retryResponse = await client.createUserToken({ userId });
      const retryData = retryResponse.data;
      if (retryData?.userToken && retryData?.encryptionKey) {
        return {
          userToken: retryData.userToken,
          encryptionKey: retryData.encryptionKey,
        };
      }
    }
    throw err;
  }
  throw new Error("Circle did not return a valid user token session.");
}

/**
 * Initiates the PIN and Wallet creation challenge for a user.
 * If user has not initialized a PIN, calls createUserPinWithWallets.
 * If user has already initialized a PIN, falls back to createWallet.
 * Returns a challengeId for the client-side W3SSdk to execute.
 */
export async function initCircleUserWalletChallenge(params: {
  userToken: string;
  blockchains?: Blockchain[];
  accountType?: "SCA" | "EOA";
}): Promise<{ challengeId: string }> {
  const client = getCircleWalletsClient();
  const blockchains = params.blockchains && params.blockchains.length > 0
    ? params.blockchains
    : [Blockchain.BaseSepolia, Blockchain.ArbSepolia];
  const accountType = params.accountType || "SCA";

  try {
    const response = await client.createUserPinWithWallets({
      userToken: params.userToken,
      blockchains,
      accountType,
    });

    const challengeId = response.data?.challengeId;
    if (!challengeId) {
      throw new Error("Circle did not return a valid challenge ID for wallet initialization.");
    }

    return { challengeId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // If the user's PIN is already initialized, create additional wallet instead
    if (message.includes("already been initialized") || message.includes("already initialized")) {
      const createResponse = await client.createWallet({
        userToken: params.userToken,
        blockchains,
        accountType,
      });

      const challengeId = createResponse.data?.challengeId;
      if (!challengeId) {
        throw new Error("Circle did not return a valid challenge ID for wallet creation.");
      }

      return { challengeId };
    }
    throw err;
  }
}

/**
 * Lists user wallets associated with the given user token.
 */
export async function listCircleUserWallets(userToken: string): Promise<Wallet[]> {
  const client = getCircleWalletsClient();
  const response = await client.listWallets({ userToken });
  return response.data?.wallets || [];
}

/**
 * Fetches status of a user challenge (e.g. COMPLETE, PENDING, FAILED).
 */
export async function getCircleUserChallenge(params: {
  userToken: string;
  challengeId: string;
}): Promise<Challenge | null> {
  const client = getCircleWalletsClient();
  const response = await client.getUserChallenge({
    userToken: params.userToken,
    challengeId: params.challengeId,
  });
  return response.data?.challenge || null;
}

/**
 * Creates a transaction transfer challenge.
 */
export async function createCircleTransferChallenge(params: {
  userToken: string;
  walletId: string;
  destinationAddress: string;
  amount: string;
  tokenAddress?: string;
  blockchain?: TokenBlockchain;
}): Promise<{ challengeId: string }> {
  const client = getCircleWalletsClient();
  const response = await client.createTransaction({
    userToken: params.userToken,
    walletId: params.walletId,
    destinationAddress: params.destinationAddress,
    amounts: [params.amount],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    ...(params.tokenAddress
      ? {
          tokenAddress: params.tokenAddress,
          blockchain: params.blockchain ?? ("BASE-SEPOLIA" as TokenBlockchain),
        }
      : {}),
  });

  const challengeId = response.data?.challengeId;
  if (!challengeId) {
    throw new Error("Circle did not return a valid challenge ID for the transfer.");
  }

  return { challengeId };
}

/**
 * Creates a smart contract interaction challenge (e.g., ERC-20 approve or CCTP burn).
 */
export async function createCircleContractExecutionChallenge(params: {
  userToken: string;
  walletId: string;
  contractAddress: string;
  callData: string;
  amount?: string;
}): Promise<{ challengeId: string }> {
  const client = getCircleWalletsClient();
  const response = await client.createUserTransactionContractExecutionChallenge({
    userToken: params.userToken,
    walletId: params.walletId,
    contractAddress: params.contractAddress,
    callData: params.callData as `0x${string}`,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    ...(params.amount ? { amount: params.amount } : {}),
  });

  const challengeId = response.data?.challengeId;
  if (!challengeId) {
    throw new Error("Circle did not return a challenge ID for smart contract execution.");
  }

  return { challengeId };
}

export { Blockchain };
