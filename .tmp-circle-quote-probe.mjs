const hookData = `0x${Buffer.concat([Buffer.from("cctp-forward", "utf8"), Buffer.alloc(20)]).toString("hex")}`;
const requests = [
  { label: "Arc->Sepolia current FORWARD+PRE_FINALITY", source: 26, destination: 0, requestTypes: ["FORWARD", "PRE_FINALITY"] },
  { label: "Arc->Sepolia standard FORWARD only", source: 26, destination: 0, requestTypes: ["FORWARD"] },
  { label: "Arc->Sepolia PRE_FINALITY only", source: 26, destination: 0, requestTypes: ["PRE_FINALITY"] },
  { label: "Sepolia->Arc standard FORWARD only", source: 0, destination: 26, requestTypes: ["FORWARD"] },
];

for (const probe of requests) {
  const body = {
    amount: "50000000",
    feeToken: probe.source === 26
      ? "0x3600000000000000000000000000000000000000"
      : "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    requests: probe.requestTypes.map((type) => type === "FORWARD"
      ? { type, params: { hookData, destinationCaller: "0x0000000000000000000000000000000000000000" } }
      : { type }),
  };
  try {
    const response = await fetch(`https://iris-api-sandbox.circle.com/v2/quote/burn/usdc/${probe.source}/${probe.destination}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch { /* report bounded text below */ }
    const result = payload && typeof payload === "object" ? payload : {};
    console.log(JSON.stringify({
      label: probe.label,
      httpStatus: response.status,
      responseKeys: Object.keys(result),
      error: result.error ?? result.message ?? result.code ?? null,
      feeTotalAmount: result.feeTotalAmount ?? null,
      feeToken: result.feeToken ?? null,
      itemSummaries: Array.isArray(result.items) ? result.items.map((item) => ({ type: item.type, amount: item.amount })) : null,
      expiry: result.expiry ?? null,
      signedQuotePresent: typeof result.signedQuote === "string",
      signedQuoteLength: typeof result.signedQuote === "string" ? result.signedQuote.length : null,
      bodyPreview: !payload && text ? text.slice(0, 300) : null,
    }));
  } catch (error) {
    console.log(JSON.stringify({ label: probe.label, fetchError: error instanceof Error ? error.name : "unknown" }));
  }
}
