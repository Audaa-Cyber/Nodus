"use client";

import type { W3SSdk as W3SSdkType } from "@circle-fin/w3s-pw-web-sdk";

let sdkInstance: W3SSdkType | null = null;

/**
 * Lazily loads and initializes the Circle W3S Web SDK instance in the browser.
 */
export async function getCircleWebSdk(appId: string): Promise<W3SSdkType> {
  if (typeof window === "undefined") {
    throw new Error("Circle Web SDK can only be initialized in the browser.");
  }
  if (!sdkInstance) {
    const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
    sdkInstance = new W3SSdk({
      appSettings: { appId },
    });
  } else {
    sdkInstance.setAppSettings({ appId });
  }
  return sdkInstance;
}

export interface ExecuteCircleChallengeParams {
  appId: string;
  userToken: string;
  encryptionKey: string;
  challengeId: string;
}

export interface ExecuteCircleChallengeResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Sets user authentication on the Web SDK and executes the given challengeId.
 * Prompts the user with the Circle secure PIN / security question modal.
 */
export async function executeCircleChallenge(
  params: ExecuteCircleChallengeParams
): Promise<ExecuteCircleChallengeResult> {
  if (typeof window === "undefined") {
    return { success: false, error: "Cannot execute Circle challenge on server." };
  }

  try {
    const sdk = await getCircleWebSdk(params.appId);
    sdk.setAuthentication({
      userToken: params.userToken,
      encryptionKey: params.encryptionKey,
    });

    return await new Promise<ExecuteCircleChallengeResult>((resolve) => {
      sdk.execute(params.challengeId, (error, result) => {
        if (error) {
          resolve({
            success: false,
            error: error.message || `Circle challenge error (code ${error.code ?? "unknown"})`,
          });
        } else {
          resolve({
            success: true,
            result,
          });
        }
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Challenge execution failed.";
    return { success: false, error: message };
  }
}

