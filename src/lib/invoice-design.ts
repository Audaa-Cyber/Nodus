import { getWalletNetwork, evmWalletChains } from "@/lib/wallet/networks";

export type SellerDetails = {
  email?: string | null; phone?: string | null; address?: string | null;
  website?: string | null; taxId?: string | null;
  founderName?: string | null; founderTitle?: string | null; reviewUrl?: string | null;
};

export function shortValue(value?: string | null): string {
  return value ? value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value : "Unavailable";
}

export function networkLabel(value?: string | null): string {
  return value ? getWalletNetwork(value)?.label ?? value : "Unavailable";
}

export function validatedHashes(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((hash): hash is string => typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash)) : [];
}

export function explorerLink(network: string | null | undefined, kind: "tx" | "address", value: string | null | undefined): string | null {
  if (!value || !new RegExp(kind === "tx" ? "^0x[0-9a-fA-F]{64}$" : "^0x[0-9a-fA-F]{40}$").test(value)) return null;
  const chainId = network ? getWalletNetwork(network)?.chainId : undefined;
  const explorer = evmWalletChains.find(chain => chain.id === chainId)?.blockExplorers?.default.url;
  return explorer ? `${explorer}/${kind}/${value}` : null;
}

export function settlementContract(evidence: unknown): string | null {
  const record = evidence && typeof evidence === "object" && !Array.isArray(evidence) ? evidence as Record<string, unknown> : {};
  const candidates = [record.escrow_contract, record.escrowContract, record.escrow_contract_address, record.escrowContractAddress, process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS];
  return candidates.find((value): value is string => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)) ?? null;
}

export function formatDesignMoney(amountMinor: number, currency: string): string {
  try { return new Intl.NumberFormat("en-US", {style:"currency",currency}).format(amountMinor / 100); }
  catch { return `${(amountMinor / 100).toFixed(2)} ${currency}`; }
}

export function formatDesignDate(value?: string | null): string {
  if (!value) return "Unavailable";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-US", {month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}) : "Unavailable";
}

export function parseInvoiceItems(value: unknown): Array<{description:string;quantity:number;unitPriceMinor:number;lineTotalMinor:number}> {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object" || typeof item.description !== "string") return [];
    const numbers = [item.quantity, item.unitPriceMinor, item.lineTotalMinor];
    if (numbers.some(number => typeof number !== "number" || !Number.isFinite(number))) return [];
    return [{description:item.description,quantity:item.quantity,unitPriceMinor:item.unitPriceMinor,lineTotalMinor:item.lineTotalMinor}];
  });
}
