import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAnonymousServerClient } from "@/lib/supabase/server";
import { readFeedbackJson, validateInvoiceRating } from "@/lib/invoice-feedback";

export const dynamic = "force-dynamic";
const headers = {"Cache-Control":"private, no-store"};
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export async function GET(_request: Request, {params}: {params:Promise<{token:string}>}) {
  const {token}=await params;
  if(!tokenPattern.test(token)) return NextResponse.json({error:"Invoice unavailable."},{status:404,headers});
  const supabase=createSupabaseAnonymousServerClient();
  const {data,error}=await supabase.rpc("lookup_shared_invoice_feedback",{p_token_hash:createHash("sha256").update(token).digest("hex")});
  if(error) return NextResponse.json({error:"Feedback is temporarily unavailable."},{status:503,headers});
  return NextResponse.json({feedback:data?.[0]??null},{headers});
}

export async function POST(request: Request, {params}: {params:Promise<{token:string}>}) {
  const {token}=await params;
  if(!tokenPattern.test(token)) return NextResponse.json({error:"Invoice unavailable."},{status:404,headers});
  let body:unknown;
  try {body=await readFeedbackJson(request);}
  catch {return NextResponse.json({error:"Invalid rating."},{status:400,headers});}
  const rating=validateInvoiceRating(body);
  if(rating===null) return NextResponse.json({error:"Choose a rating from 1 to 5."},{status:400,headers});
  const comment=(body as {comment?:string}).comment;
  const supabase=createSupabaseAnonymousServerClient();
  const {data,error}=await supabase.rpc("submit_shared_invoice_feedback",{p_token_hash:createHash("sha256").update(token).digest("hex"),p_rating:rating,p_comment:comment??null});
  if(error||!data?.[0]) return NextResponse.json({error:"Feedback could not be saved."},{status:error?.code==="P0002"?404:503,headers});
  return NextResponse.json({feedback:data[0]},{headers});
}
