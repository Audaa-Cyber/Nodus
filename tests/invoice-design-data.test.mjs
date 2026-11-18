import test from 'node:test';
import assert from 'node:assert/strict';
import { readFeedbackJson, validateInvoiceRating, safeReviewUrl } from '../src/lib/invoice-feedback.ts';
import { buildReceiptPdf } from '../src/lib/receipt-pdf.ts';

test('ratings accept only integral one-to-five values', () => {
  for (const rating of [1, 2, 3, 4, 5]) assert.equal(validateInvoiceRating({rating}), rating);
  for (const rating of [0, 6, 1.5, '5', null, NaN, Infinity]) assert.equal(validateInvoiceRating({rating}), null);
  assert.equal(validateInvoiceRating(null), null);
  assert.equal(validateInvoiceRating({rating: 5, comment: 'x'.repeat(2001)}), null);
});

test('review targets reject executable and untrusted URL schemes', () => {
  assert.equal(safeReviewUrl('javascript:alert(1)'), null);
  assert.equal(safeReviewUrl('data:text/html,hello'), null);
  assert.equal(safeReviewUrl('//evil.example'), null);
  assert.equal(safeReviewUrl('/\t/evil.example'), null);
  assert.equal(safeReviewUrl('https://merchant.example/review'), 'https://merchant.example/review');
  assert.equal(safeReviewUrl('/pay/token#review'), '/pay/token#review');
});

test('feedback body reader cancels oversized chunked requests before reading the remainder', async () => {
  let pulled=0,cancelled=false;
  const body=new ReadableStream({pull(controller){pulled++;controller.enqueue(new Uint8Array(9000));},cancel(){cancelled=true;}},{highWaterMark:0});
  await assert.rejects(readFeedbackJson(new Request('http://localhost/feedback',{method:'POST',body,duplex:'half'})),/Invalid feedback body/);
  assert.equal(cancelled,true);
  assert.equal(pulled,1);
  assert.deepEqual(await readFeedbackJson(new Request('http://localhost/feedback',{method:'POST',body:JSON.stringify({rating:5})})),{rating:5});
});

test('Unicode identity never disappears from an official PDF silently', () => {
  assert.throws(()=>buildReceiptPdf({receiptNumber:'RCP-42',invoiceNumber:'INV-42',businessName:'አዲስ አበባ',amount:'123.45 USDC',issuedAt:'2026-11-18',network:'Arbitrum Sepolia',transactions:[],recipient:'Unavailable',sellerDetails:[],items:[]}),/UNICODE_REQUIRES_PRINT/);
});

test('receipt PDF encodes real fields with valid byte offsets and escapes PDF text', () => {
  const pdf = buildReceiptPdf({receiptNumber:'RCP-42',invoiceNumber:'INV-42',businessName:'A (Studio) \\ Partners',amount:'123.45 USDC',issuedAt:'2026-11-18T04:30:15Z',network:'Arbitrum Sepolia',transactions:['0x'+'a'.repeat(64)],recipient:'0x'+'b'.repeat(40),sellerDetails:['billing@example.com'],items:['Service - 123.45 USDC']});
  const text = Buffer.from(pdf).toString('ascii');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.includes('RCP-42'));
  assert.ok(text.includes('123.45 USDC'));
  assert.ok(text.includes('A \\(Studio\\) \\\\ Partners'));
  assert.ok(!text.includes('2,200.00'));
  const xref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(text.slice(xref, xref + 4), 'xref');
  const entries = text.slice(xref).split('\n').slice(3,8);
  for (let i=0;i<entries.length;i++) assert.ok(text.slice(Number(entries[i].slice(0,10))).startsWith(`${i+1} 0 obj`));
});
