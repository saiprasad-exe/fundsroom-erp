import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type CustomerType = Database["public"]["Enums"]["customer_type"];
export type CustomerStatus = Database["public"]["Enums"]["customer_status"];
export type MovementType = Database["public"]["Enums"]["movement_type"];
export type ChallanStatus = Database["public"]["Enums"]["challan_status"];

export type Customer = Database["public"]["Tables"]["customers"]["Row"];
export type FollowUp = Database["public"]["Tables"]["follow_ups"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type StockMovement = Database["public"]["Tables"]["stock_movements"]["Row"];
export type Challan = Database["public"]["Tables"]["challans"]["Row"];
export type ChallanItem = Database["public"]["Tables"]["challan_items"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type ChallanWithCustomer = Challan & {
  customers: Pick<Customer, "id" | "customer_name" | "business_name"> | null;
};

export type ChallanDetail = ChallanWithCustomer & {
  challan_items: ChallanItem[];
};

export type StockMovementWithProduct = StockMovement & {
  products: Pick<Product, "id" | "product_name" | "sku"> | null;
};

export interface Paginated<T> {
  records: T[];
  page: number;
  limit: number;
  totalRecords: number;
  totalPages: number;
}

export const ROLES: AppRole[] = ["ADMIN", "SALES", "WAREHOUSE", "ACCOUNTS"];
export const CUSTOMER_TYPES: CustomerType[] = ["RETAIL", "WHOLESALE", "DISTRIBUTOR"];
export const CUSTOMER_STATUSES: CustomerStatus[] = ["LEAD", "ACTIVE", "INACTIVE"];
export const CHALLAN_STATUSES: ChallanStatus[] = ["DRAFT", "CONFIRMED", "CANCELLED"];
