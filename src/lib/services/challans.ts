import { supabase } from "@/integrations/supabase/client";
import { toApiError } from "@/lib/api-error";
import type { ChallanInput } from "@/lib/validators";
import type { ChallanDetail, ChallanStatus, ChallanWithCustomer, Paginated } from "@/types";

export interface ChallanListParams {
  page?: number;
  limit?: number;
  status?: ChallanStatus | "ALL";
  customerId?: string | "ALL";
}

export async function listChallans(
  params: ChallanListParams = {},
): Promise<Paginated<ChallanWithCustomer>> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 10));

  let query = supabase
    .from("challans")
    .select("*, customers(id, customer_name, business_name)", { count: "exact" });
  if (params.status && params.status !== "ALL") query = query.eq("status", params.status);
  if (params.customerId && params.customerId !== "ALL")
    query = query.eq("customer_id", params.customerId);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (error) throw toApiError(error);

  const totalRecords = count ?? 0;
  return {
    records: (data ?? []) as ChallanWithCustomer[],
    page,
    limit,
    totalRecords,
    totalPages: Math.max(1, Math.ceil(totalRecords / limit)),
  };
}

export async function getChallan(id: string): Promise<ChallanDetail> {
  const { data, error } = await supabase
    .from("challans")
    .select("*, customers(id, customer_name, business_name), challan_items(*)")
    .eq("id", id)
    .single();
  if (error) throw toApiError(error);
  return data as ChallanDetail;
}

/** Creates a DRAFT challan. Draft creation never touches stock. */
export async function createChallan(input: ChallanInput): Promise<ChallanDetail> {
  const { data: auth } = await supabase.auth.getUser();

  const productIds = input.items.map((i) => i.product_id);
  const { data: products, error: productError } = await supabase
    .from("products")
    .select("id, product_name, sku, unit_price")
    .in("id", productIds);
  if (productError) throw toApiError(productError);

  const { data: challan, error } = await supabase
    .from("challans")
    .insert({
      customer_id: input.customer_id,
      notes: input.notes?.trim() || null,
      created_by: auth.user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw toApiError(error);

  const rows = input.items.map((item) => {
    const product = (products ?? []).find((p) => p.id === item.product_id);
    if (!product) throw toApiError({ message: "NOT_FOUND: Product no longer exists." });
    return {
      challan_id: challan.id,
      product_id: product.id,
      product_name_snapshot: product.product_name,
      sku_snapshot: product.sku,
      unit_price_snapshot: product.unit_price,
      quantity: item.quantity,
    };
  });

  const { error: itemError } = await supabase.from("challan_items").insert(rows);
  if (itemError) {
    await supabase.from("challans").update({ status: "CANCELLED" }).eq("id", challan.id);
    throw toApiError(itemError);
  }

  return getChallan(challan.id);
}

/** Updates a DRAFT challan: customer, notes and the full item list. */
export async function updateChallan(id: string, input: ChallanInput): Promise<ChallanDetail> {
  const { error } = await supabase
    .from("challans")
    .update({ customer_id: input.customer_id, notes: input.notes?.trim() || null })
    .eq("id", id);
  if (error) throw toApiError(error);

  const { error: deleteError } = await supabase.from("challan_items").delete().eq("challan_id", id);
  if (deleteError) throw toApiError(deleteError);

  const { data: products, error: productError } = await supabase
    .from("products")
    .select("id, product_name, sku, unit_price")
    .in(
      "id",
      input.items.map((i) => i.product_id),
    );
  if (productError) throw toApiError(productError);

  const rows = input.items.map((item) => {
    const product = (products ?? []).find((p) => p.id === item.product_id);
    if (!product) throw toApiError({ message: "NOT_FOUND: Product no longer exists." });
    return {
      challan_id: id,
      product_id: product.id,
      product_name_snapshot: product.product_name,
      sku_snapshot: product.sku,
      unit_price_snapshot: product.unit_price,
      quantity: item.quantity,
    };
  });

  const { error: itemError } = await supabase.from("challan_items").insert(rows);
  if (itemError) throw toApiError(itemError);

  return getChallan(id);
}

/**
 * Confirms a challan. All stock validation, decrements and OUT movements happen
 * inside one database transaction — insufficient stock rejects the whole request.
 */
export async function confirmChallan(id: string) {
  const { data, error } = await supabase.rpc("confirm_challan", { _challan_id: id });
  if (error) throw toApiError(error);
  return data;
}

export async function cancelChallan(id: string) {
  const { data, error } = await supabase.rpc("cancel_challan", { _challan_id: id });
  if (error) throw toApiError(error);
  return data;
}
