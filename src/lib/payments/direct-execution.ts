import { encodeFunctionData, parseAbi, type Address } from "viem";

const abi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

/** A single signature request, with no provider retries after a possible broadcast. */
export async function executeDirectUsdc(input: {
  chainId: number; payer: Address; token: Address; recipient: Address; amount: bigint;
  assertWallet: () => Promise<void>;
  balance: () => Promise<{ usdc: bigint; native: bigint; gas: bigint; gasUsesUsdc: boolean }>;
  send: (request: { chainId: number; account: Address; to: Address; data: `0x${string}`; value: bigint }) => Promise<`0x${string}`>;
}) {
  await input.assertWallet();
  const balance = await input.balance();
  const gasUsdc = balance.gasUsesUsdc ? (balance.gas + 999_999_999_999n) / 1_000_000_000_000n : 0n;
  if (balance.usdc < input.amount + gasUsdc) throw new Error("Insufficient USDC for payment and applicable network gas.");
  if (balance.native < balance.gas) throw new Error("Insufficient native balance for network gas.");
  await input.assertWallet();
  return input.send({
    chainId: input.chainId, account: input.payer, to: input.token, value: 0n,
    data: encodeFunctionData({ abi, functionName: "transfer", args: [input.recipient, input.amount] }),
  });
}
