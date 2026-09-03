import { supabase } from "@/integrations/supabase/client";
import { toApiError } from "@/lib/api-error";
import { sanitizeSearch, type ProductInput, type StockAdjustInput } from "@/lib/validators";
import type { Paginated, Product, StockMovementWithProduct } from "@/types";

export interface ProductListParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string | "ALL";
  lowStockOnly?: boolean;
}

export async function listProducts(params: ProductListParams = {}): Promise<Paginated<Product>> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 10));

  let query = supabase.from("products").select("*", { count: "exact" });

  const search = sanitizeSearch(params.search ?? "");
  if (search) {
    query = query.or(
      [`product_name.ilike.%${search}%`, `sku.ilike.%${search}%`, `category.ilike.%${search}%`].join(
        ",",
      ),
    );
  }
  if (params.category && params.category !== "ALL") query = query.eq("category", params.category);

  const { data, error, count } = await query
    .order("product_name", { ascending: true })
    .range((page - 1) * limit, page * limit - 1);
  if (error) throw toApiError(error);

  let records = data ?? [];
  if (params.lowStockOnly) {
    records = records.filter((p) => p.current_stock <= p.minimum_stock_quantity);
  }

  const totalRecords = count ?? 0;
  return {
    records,
    page,
    limit,
    totalRecords,
    totalPages: Math.max(1, Math.ceil(totalRecords / limit)),
  };
}

export async function listAllProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("product_name", { ascending: true });
  if (error) throw toApiError(error);
  return data ?? [];
}

export async function listCategories(): Promise<string[]> {
  const { data, error } = await supabase.from("products").select("category");
  if (error) throw toApiError(error);
  return Array.from(new Set((data ?? []).map((r) => r.category))).sort();
}

export async function getProduct(id: string): Promise<Product> {
  const { data, error } = await supabase.from("products").select("*").eq("id", id).single();
  if (error) throw toApiError(error);
  return data;
}

function toRow(input: ProductInput) {
  return {
    product_name: input.product_name.trim(),
    sku: input.sku.trim().toUpperCase(),
    category: input.category.trim(),
    unit_price: input.unit_price,
    current_stock: input.current_stock,
    minimum_stock_quantity: input.minimum_stock_quantity,
    warehouse_location: input.warehouse_location?.trim() || null,
  };
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("products")
    .insert({ ...toRow(input), created_by: auth.user?.id ?? null })
    .select("*")
    .single();
  if (error) throw toApiError(error);
  return data;
}

export async function updateProduct(id: string, input: ProductInput): Promise<Product> {
  const { current_stock: _ignored, ...rest } = toRow(input);
  const { data, error } = await supabase
    .from("products")
    .update(rest)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw toApiError(error);
  return data;
}

/** Stock changes always go through the guarded, transactional RPC. */
export async function adjustStock(input: StockAdjustInput) {
  const { data, error } = await supabase.rpc("adjust_stock", {
    _product_id: input.product_id,
    _quantity: input.quantity,
    _movement_type: input.movement_type,
    _reason: input.reason.trim(),
  });
  if (error) throw toApiError(error);
  return data;
}

export async function listStockMovements(params: {
  productId?: string;
  page?: number;
  limit?: number;
}): Promise<Paginated<StockMovementWithProduct>> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 10));

  let query = supabase
    .from("stock_movements")
    .select("*, products(id, product_name, sku)", { count: "exact" });
  if (params.productId) query = query.eq("product_id", params.productId);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (error) throw toApiError(error);

  const totalRecords = count ?? 0;
  return {
    records: (data ?? []) as StockMovementWithProduct[],
    page,
    limit,
    totalRecords,
    totalPages: Math.max(1, Math.ceil(totalRecords / limit)),
  };
}
