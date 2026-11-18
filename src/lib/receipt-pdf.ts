export type ReceiptPdfData = {
  receiptNumber: string;
  invoiceNumber: string;
  businessName: string;
  amount: string;
  issuedAt: string;
  network: string;
  transactions: string[];
  recipient: string;
  sellerDetails: string[];
  items: string[];
};

// PDF text uses built-in Helvetica. Keep all bytes ASCII so xref offsets are exact.
function pdfText(value: string): string {
  return value.normalize("NFKD").replace(/[^\x20-\x7E]/g, " ").replace(/[\\()]/g, character => `\\${character}`);
}

export function buildReceiptPdf(receipt: ReceiptPdfData): Uint8Array {
  if (/[^\x00-\x7f]/.test(JSON.stringify(receipt))) throw new Error("UNICODE_REQUIRES_PRINT");
  const lines = ["NODUS - OFFICIAL PAYMENT RECEIPT", "", `Receipt: ${receipt.receiptNumber}`, `Invoice: ${receipt.invoiceNumber}`,
    `Paid to: ${receipt.businessName}`, `Amount received: ${receipt.amount}`, `Issued: ${receipt.issuedAt}`,
    `Settlement network: ${receipt.network}`, `Recipient: ${receipt.recipient}`, "", "Independent on-chain settlement verification",
    ...receipt.transactions.flatMap(hash => ["Destination transaction:", hash]), "", ...receipt.sellerDetails,
    "", "Invoice items", ...receipt.items, "", "This receipt records verified payment; it is not a separate invoice."];
  const wrapped = lines.flatMap(line => {
    const result: string[] = [];
    let remainder = line;
    while (remainder.length > 86) {
      const breakAt = remainder.lastIndexOf(" ", 86);
      const end = breakAt > 25 ? breakAt : 86;
      result.push(remainder.slice(0, end));
      remainder = remainder.slice(end).trimStart();
    }
    return [...result, remainder];
  });
  const pages: string[][] = [];
  for (let index = 0; index < wrapped.length; index += 45) pages.push(wrapped.slice(index, index + 45));
  const pageCount = pages.length;
  const fontId = 3 + pageCount * 2;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pageCount} >>`];
  pages.forEach((page, index) => {
    const pageId = 3 + index * 2;
    const stream = `BT /F1 11 Tf 16 TL 48 748 Td\n${page.map((line, row) => `${row ? "T* " : ""}(${pdfText(line)}) Tj`).join("\n")}\nET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${pageId + 1} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let output = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = output.length;
  output += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  output += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(output);
}
