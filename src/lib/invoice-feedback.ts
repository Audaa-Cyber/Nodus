export type InvoiceFeedback = {
  rating: number;
  comment: string | null;
  customer_name: string | null;
  submitted_at: string;
};

export function validateInvoiceRating(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.rating !== "number" || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) return null;
  if (input.comment !== undefined && (typeof input.comment !== "string" || input.comment.length > 2000)) return null;
  return input.rating;
}

export function safeReviewUrl(value?: string | null): string | null {
  if (!value) return null;
  if (/[\x00-\x20\x7f]/.test(value)) return null;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export async function readFeedbackJson(request: Request): Promise<unknown> {
  const limit = 8192;
  if (Number(request.headers.get("content-length") ?? 0) > limit || !request.body) throw new Error("Invalid feedback body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {await reader.cancel();throw new Error("Invalid feedback body");}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const buffer = new Uint8Array(bytes);
  let offset=0;
  for (const chunk of chunks) {buffer.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(buffer));
}
