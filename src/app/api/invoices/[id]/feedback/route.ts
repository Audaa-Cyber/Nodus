import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth/business-context";

export const dynamic = "force-dynamic";
const headers={"Cache-Control":"private, no-store"};

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({error:"Invoice unavailable."},{status:404,headers});
  const {supabase,user,business}=await getBusinessContext();
  if(!user)return NextResponse.json({error:"Unauthorized."},{status:401,headers});
  if(!business)return NextResponse.json({error:"Invoice unavailable."},{status:404,headers});
  const {data:invoice}=await supabase.from("invoices").select("id,customer_name").eq("id",id).eq("business_id",business.id).maybeSingle();
  if(!invoice)return NextResponse.json({error:"Invoice unavailable."},{status:404,headers});
  const {data:feedback,error}=await supabase.from("invoice_feedback").select("rating,comment,submitted_at").eq("invoice_id",id).eq("business_id",business.id).maybeSingle();
  if(error)return NextResponse.json({error:"Feedback unavailable."},{status:503,headers});
  return NextResponse.json({feedback:feedback?{...feedback,customer_name:invoice.customer_name}:null},{headers});
}
