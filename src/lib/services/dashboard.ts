import { supabase } from "@/integrations/supabase/client";
import { toApiError } from "@/lib/api-error";
import type { ChallanWithCustomer, Product, StockMovementWithProduct } from "@/types";

export interface DashboardSummary {
  totalCustomers: number;
  totalProducts: number;
  lowStockProducts: Product[];
  draftChallans: number;
  confirmedChallans: number;
  recentChallans: ChallanWithCustomer[];
  recentMovements: StockMovementWithProduct[];
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [customers, products, drafts, confirmed, lowStock, recentChallans, recentMovements] =
    await Promise.all([
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("challans").select("id", { count: "exact", head: true }).eq("status", "DRAFT"),
      supabase
        .from("challans")
        .select("id", { count: "exact", head: true })
        .eq("status", "CONFIRMED"),
      supabase.from("products").select("*").order("current_stock", { ascending: true }),
      supabase
        .from("challans")
        .select("*, customers(id, customer_name, business_name)")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("stock_movements")
        .select("*, products(id, product_name, sku)")
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

  const firstError =
    customers.error ??
    products.error ??
    drafts.error ??
    confirmed.error ??
    lowStock.error ??
    recentChallans.error ??
    recentMovements.error;
  if (firstError) throw toApiError(firstError);

  return {
    totalCustomers: customers.count ?? 0,
    totalProducts: products.count ?? 0,
    lowStockProducts: (lowStock.data ?? []).filter(
      (p) => p.current_stock <= p.minimum_stock_quantity,
    ),
    draftChallans: drafts.count ?? 0,
    confirmedChallans: confirmed.count ?? 0,
    recentChallans: (recentChallans.data ?? []) as ChallanWithCustomer[],
    recentMovements: (recentMovements.data ?? []) as StockMovementWithProduct[],
  };
}
