import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { circleTestnetUsdcNetworks } from "@/lib/wallet/networks";
import { buildThirtyDayDateRange, computeDailyReceipts } from "@/lib/dashboard/daily-receipts";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: business, error: profileError } = await supabase
    .from("business_profiles")
    .select("id, receiving_network")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (profileError || !business) {
    return NextResponse.json({ error: "Business profile not found." }, { status: 404 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29);
  thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

  // The RPC is security-invoker and derives its merchant scope from auth.uid().
  // It reads only verified, paid NODUS invoice settlements under the caller's RLS.
  // The 30-day verified settlement query retrieves historical receipts for the chart.
  const [balanceResult, settlementsResult] = await Promise.all([
    supabase.rpc("merchant_nodus_received_by_chain"),
    supabase
      .from("payment_settlements")
      .select("destination_network, received_amount_base_units, received_asset_decimals, created_at")
      .eq("business_id", business.id)
      .eq("outcome", "VERIFIED")
      .eq("provider_status", "SUCCESS")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: true }),
  ]);

  if (balanceResult.error || !balanceResult.data) {
    return NextResponse.json({ error: "NODUS received balance is unavailable." }, { status: 503 });
  }

  const rows = balanceResult.data;
  const verifiedSettlements = settlementsResult.data ?? [];
  const thirtyDayRange = buildThirtyDayDateRange();

  const totalsByNetwork = new Map(rows.map((row) => [row.destination_network, row]));
  const chains = circleTestnetUsdcNetworks.map((network) => {
    const row = totalsByNetwork.get(network.key);
    const dailyReceipts = computeDailyReceipts(verifiedSettlements, network.key, thirtyDayRange);
    return {
      networkKey: network.key,
      networkLabel: network.label,
      totalBaseUnits: row?.total_base_units ?? "0",
      paymentCount: row?.payment_count ?? 0,
      dailyReceipts,
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
