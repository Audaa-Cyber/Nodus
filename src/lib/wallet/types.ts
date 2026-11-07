import type { WalletNetwork } from "./networks";

export type WalletAsset = {
  assetId: string;
  symbol: string;
  decimals: number;
  network: WalletNetwork;
  contractAddress: string | null;
};

export type WalletConnectionSnapshot = {
  address: string | null;
  network: WalletNetwork | null;
};
