import { supabase } from "@/integrations/supabase/client";
import { toApiError } from "@/lib/api-error";
import { sanitizeSearch, type CustomerInput, type FollowUpInput } from "@/lib/validators";
import type { Customer, CustomerStatus, CustomerType, FollowUp, Paginated } from "@/types";

export interface CustomerListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: CustomerStatus | "ALL";
  customer_type?: CustomerType | "ALL";
}

function nullify(value?: string | null) {
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

export async function listCustomers(params: CustomerListParams = {}): Promise<Paginated<Customer>> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 10));

  let query = supabase.from("customers").select("*", { count: "exact" });

  const search = sanitizeSearch(params.search ?? "");
  if (search) {
    query = query.or(
      [
        `customer_name.ilike.%${search}%`,
        `mobile_number.ilike.%${search}%`,
        `business_name.ilike.%${search}%`,
        `email.ilike.%${search}%`,
      ].join(","),
    );
  }
  if (params.status && params.status !== "ALL") query = query.eq("status", params.status);
  if (params.customer_type && params.customer_type !== "ALL")
    query = query.eq("customer_type", params.customer_type);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (error) throw toApiError(error);

  const totalRecords = count ?? 0;
  return {
    records: data ?? [],
    page,
    limit,
    totalRecords,
    totalPages: Math.max(1, Math.ceil(totalRecords / limit)),
  };
}

export async function getCustomer(id: string): Promise<Customer> {
  const { data, error } = await supabase.from("customers").select("*").eq("id", id).single();
  if (error) throw toApiError(error);
  return data;
}

export async function listFollowUps(customerId: string): Promise<FollowUp[]> {
  const { data, error } = await supabase
    .from("follow_ups")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw toApiError(error);
  return data ?? [];
}

function toRow(input: CustomerInput) {
  return {
    customer_name: input.customer_name.trim(),
    mobile_number: input.mobile_number.trim(),
    email: nullify(input.email),
    business_name: nullify(input.business_name),
    gst_number: nullify(input.gst_number),
    customer_type: input.customer_type,
    status: input.status,
    address: nullify(input.address),
    follow_up_date: nullify(input.follow_up_date),
    notes: nullify(input.notes),
  };
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("customers")
    .insert({ ...toRow(input), created_by: auth.user?.id ?? null })
    .select("*")
    .single();
  if (error) throw toApiError(error);
  return data;
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<Customer> {
  const { data, error } = await supabase
    .from("customers")
    .update(toRow(input))
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw toApiError(error);
  return data;
}

export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw toApiError(error);
}

export async function addFollowUp(customerId: string, input: FollowUpInput): Promise<FollowUp> {
  const { data: auth } = await supabase.auth.getUser();
  const followUpDate = nullify(input.follow_up_date);
  const { data, error } = await supabase
    .from("follow_ups")
    .insert({
      customer_id: customerId,
      note: input.note.trim(),
      follow_up_date: followUpDate,
      created_by: auth.user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw toApiError(error);

  if (followUpDate) {
    await supabase.from("customers").update({ follow_up_date: followUpDate }).eq("id", customerId);
  }
  return data;
}
