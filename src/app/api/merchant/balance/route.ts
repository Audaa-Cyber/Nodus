import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { circleTestnetUsdcNetworks } from "@/lib/wallet/networks";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: business, error: profileError } = await supabase
    .from("business_profiles")
    .select("receiving_network")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (profileError || !business) {
    return NextResponse.json({ error: "Business profile not found." }, { status: 404 });
  }

  // The RPC is security-invoker and derives its merchant scope from auth.uid().
  // It reads only verified, paid NODUS invoice settlements under the caller's RLS.
  const { data: rows, error: balanceError } = await supabase.rpc("merchant_nodus_received_by_chain");
  if (balanceError || !rows) {
    return NextResponse.json({ error: "NODUS received balance is unavailable." }, { status: 503 });
  }

  const totalsByNetwork = new Map(rows.map((row) => [row.destination_network, row]));
  const chains = circleTestnetUsdcNetworks.map((network) => {
    const row = totalsByNetwork.get(network.key);
    return {
      networkKey: network.key,
      networkLabel: network.label,
      totalBaseUnits: row?.total_base_units ?? "0",
      paymentCount: row?.payment_count ?? 0,
    };
  });
  const totalBaseUnits = chains.reduce((total, chain) => total + BigInt(chain.totalBaseUnits), 0n).toString();

  return NextResponse.json({
    error: null,
    status: "ok",
    decimals: 6,
    totalBaseUnits,
    selectedNetwork: business.receiving_network,
    chains,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
