import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAnonymousServerClient } from "@/lib/supabase/server";
import { buildReceiptPdf } from "@/lib/receipt-pdf";
import { networkLabel, parseInvoiceItems, formatDesignMoney, validatedHashes } from "@/lib/invoice-design";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};

function formatReceived(amount:string|null,decimals:number|null):string|null {
  if(!amount||!/^\d+$/.test(amount)||decimals===null||!Number.isInteger(decimals)||decimals<0||decimals>30)return null;
  if(decimals===0)return amount;
  const padded=amount.padStart(decimals+1,"0");
  return `${padded.slice(0,-decimals)}.${padded.slice(-decimals)}`;
}

export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}) {
  const {token}=await params;
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))return NextResponse.json({error:"Invoice unavailable."},{status:404,headers});
  const supabase=createSupabaseAnonymousServerClient();
  const hash=createHash("sha256").update(token).digest("hex");
  const [invoiceResult,receiptResult,destinationResult]=await Promise.all([
    supabase.rpc("lookup_shared_invoice",{p_token_hash:hash}),
    supabase.rpc("lookup_shared_payment_receipts",{p_token_hash:hash}),
    supabase.rpc("lookup_shared_receipt_destinations",{p_token_hash:hash}),
  ]);
  if(invoiceResult.error||receiptResult.error||destinationResult.error)return NextResponse.json({error:"Receipt unavailable."},{status:503,headers});
  const invoice=invoiceResult.data?.[0];
  if(!invoice||invoice.link_status!=="active"||invoice.status!=="paid")return NextResponse.json({error:"Receipt unavailable."},{status:404,headers});
  const receipt=receiptResult.data?.find(record=>record.outcome==="VERIFIED"||record.outcome==="OVERPAID");
  const transactions=validatedHashes(receipt?.destination_tx_hashes);
  const received=receipt?formatReceived(receipt.received_amount_base_units,receipt.received_asset_decimals):null;
  if(!receipt||!transactions.length||!received)return NextResponse.json({error:"Verified receipt is not ready yet."},{status:409,headers});
  const seller=invoice.seller_snapshot&&typeof invoice.seller_snapshot==="object"&&!Array.isArray(invoice.seller_snapshot)?invoice.seller_snapshot as Record<string,unknown>:{};
  const details=[seller.business_address,seller.business_phone,seller.email,seller.tax_registration_number].filter((value):value is string=>typeof value==="string");
  const businessName=typeof seller.business_name==="string"?seller.business_name:invoice.business_name??receipt.business_name??"Business";
  const destination=destinationResult.data?.find(record=>record.receipt_number===receipt.receipt_number);
  if(!destination?.recipient_address)return NextResponse.json({error:"Verified receipt is not ready yet."},{status:409,headers});
  const receiptData={receiptNumber:receipt.receipt_number,invoiceNumber:receipt.invoice_number,businessName,
    amount:`${received} ${receipt.destination_asset_id?.endsWith(":usdc")?"USDC":receipt.destination_asset_id??"asset"}`,
    issuedAt:receipt.issued_at,network:networkLabel(receipt.destination_network),transactions,
    recipient:destination.recipient_address,sellerDetails:details,
    items:parseInvoiceItems(invoice.line_items).map(item=>`${item.description} (${item.quantity} x ${formatDesignMoney(item.unitPriceMinor,invoice.currency??"USD")}) - ${formatDesignMoney(item.lineTotalMinor,invoice.currency??"USD")}`)};
  let pdf:Uint8Array;
  try {pdf=buildReceiptPdf(receiptData);}
  catch(error) {
    if(error instanceof Error&&error.message==="UNICODE_REQUIRES_PRINT")return NextResponse.json({error:"Use Print / Save PDF to preserve all characters in this receipt.",code:"unicode_receipt_requires_print"},{status:422,headers});
    throw error;
  }
  const filename=`nodus-receipt-${receipt.receipt_number.replace(/[^a-zA-Z0-9_-]/g,"_")}.pdf`;
  return new Response(pdf as BodyInit,{headers:{...headers,"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${filename}"`,"X-Content-Type-Options":"nosniff"}});
}
