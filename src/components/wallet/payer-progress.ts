export type PaymentStage = "idle" | "authorizing" | "broadcasting" | "verifying" | "settled" | "error";

/** Presentation only: a broadcast cannot substitute for backend settlement. */
export function paymentProgress({ stage, depositTxHash, approvalTxHash, direct }: {
  stage: PaymentStage;
  depositTxHash: string | null;
  approvalTxHash: string | null;
  direct: boolean;
}) {
  return {
    current: stage === "settled" ? 3 : depositTxHash || stage === "verifying" ? 2 : direct || approvalTxHash || stage === "broadcasting" ? 1 : 0,
    complete: stage === "settled",
    allowanceRequired: !direct,
  };
}
