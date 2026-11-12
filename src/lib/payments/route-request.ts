import type { WalletAsset } from "../wallet/types.ts";

export interface PaymentRoutesRequest {
  sourceAssetId: string;
  sourceNetwork: string;
  sourceSymbol: string;
  sourceDecimals: number;
  sourceContractAddress: string | null;
  senderAddress: string;
}

/** Build the same canonical route request for Circle guest and external EVM wallets. */
export function buildPaymentRoutesRequest(
  asset: WalletAsset,
  senderAddress: string,
): PaymentRoutesRequest {
  const sourceNetwork = asset.network.key.trim().toLowerCase().replace(/_/g, "-");
  return {
    sourceAssetId: asset.assetId.trim().replace(/^([^:]+):/, `${sourceNetwork}:`),
    sourceNetwork,
    sourceSymbol: asset.symbol.trim().toUpperCase(),
    sourceDecimals: asset.decimals,
    sourceContractAddress: asset.contractAddress,
    senderAddress,
  };
}
