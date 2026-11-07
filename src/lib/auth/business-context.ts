import "server-only";

import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Share the verified user and their business profile across the dashboard layout
 * and page during one server render. React cache is request-scoped, so this never
 * reuses a business context across users or requests.
 */
export const getBusinessContext = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, business: null };

  const { data: business } = await supabase
    .from("business_profiles")
    .select("id,business_name,email,receiving_address,receiving_network,created_at,updated_at")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  return { supabase, user, business };
});
