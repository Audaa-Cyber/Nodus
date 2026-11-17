import Image from "next/image";
import { Globe2 } from "lucide-react";

type NetworkLogoProps = {
  networkKey?: string | null;
  size?: "sm" | "md";
};

const networkLogos = new Map([
  ["sepolia", "/networks/ethereum.png"],
  ["base-sepolia", "/networks/base.svg"],
  ["arbitrum-sepolia", "/networks/arbitrum.svg"],
  ["optimism-sepolia", "/networks/optimism.svg"],
  ["arc-testnet", "/networks/arc.svg"],
]);

export function getNetworkLogoSrc(networkKey?: string | null) {
  return networkLogos.get(networkKey?.trim().toLowerCase() ?? "");
}

/** Decorative next to the network label; asset provenance is in public/networks/README.md. */
export function NetworkLogo({ networkKey, size = "sm" }: NetworkLogoProps) {
  const src = getNetworkLogoSrc(networkKey);
  const pixels = size === "md" ? 24 : 18;

  return (
    <span className={`network-logo network-logo-${size}${src ? "" : " network-logo-fallback"}`} aria-hidden="true">
      {src ? (
        <Image src={src} width={pixels} height={pixels} alt="" />
      ) : (
        <Globe2 size={pixels} strokeWidth={1.6} focusable="false" />
      )}
    </span>
  );
}
