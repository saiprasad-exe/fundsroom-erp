import { z } from "zod";

const mobileRegex = /^[6-9]\d{9}$/;

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const signupSchema = loginSchema.extend({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  role: z.enum(["ADMIN", "SALES", "WAREHOUSE", "ACCOUNTS"]),
});

export const customerSchema = z.object({
  customer_name: z.string().trim().min(2, "Customer name is required").max(120),
  mobile_number: z
    .string()
    .trim()
    .regex(mobileRegex, "Enter a valid 10-digit Indian mobile number"),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .optional()
    .or(z.literal("")),
  business_name: z.string().trim().max(160).optional().or(z.literal("")),
  gst_number: z
    .string()
    .trim()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Enter a valid 15-character GST number")
    .optional()
    .or(z.literal("")),
  customer_type: z.enum(["RETAIL", "WHOLESALE", "DISTRIBUTOR"]),
  status: z.enum(["LEAD", "ACTIVE", "INACTIVE"]),
  address: z.string().trim().max(400).optional().or(z.literal("")),
  follow_up_date: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const followUpSchema = z.object({
  note: z.string().trim().min(3, "Note must be at least 3 characters").max(1000),
  follow_up_date: z.string().optional().or(z.literal("")),
});

export const productSchema = z.object({
  product_name: z.string().trim().min(2, "Product name is required").max(160),
  sku: z
    .string()
    .trim()
    .min(3, "SKU is required")
    .max(40)
    .regex(/^[A-Za-z0-9-_]+$/, "SKU may contain letters, numbers, dashes and underscores only"),
  category: z.string().trim().min(2, "Category is required").max(60),
  unit_price: z.coerce.number().min(0, "Unit price cannot be negative"),
  current_stock: z.coerce.number().int("Stock must be a whole number").min(0, "Stock cannot be negative"),
  minimum_stock_quantity: z.coerce
    .number()
    .int("Minimum stock must be a whole number")
    .min(0, "Minimum stock cannot be negative"),
  warehouse_location: z.string().trim().max(60).optional().or(z.literal("")),
});

export const stockAdjustSchema = z.object({
  product_id: z.string().uuid("Select a product"),
  movement_type: z.enum(["IN", "OUT"]),
  quantity: z.coerce.number().int("Quantity must be a whole number").positive("Quantity must be greater than zero"),
  reason: z.string().trim().min(3, "Reason is required").max(200),
});

export const challanSchema = z.object({
  customer_id: z.string().uuid("Select a customer"),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid("Select a product"),
        quantity: z.coerce.number().int("Quantity must be a whole number").positive("Quantity must be greater than zero"),
      }),
    )
    .min(1, "Add at least one product"),
});

export type CustomerInput = z.infer<typeof customerSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;
export type ChallanInput = z.infer<typeof challanSchema>;
export type FollowUpInput = z.infer<typeof followUpSchema>;

/** Escapes characters that would break a PostgREST `or(...)` filter list. */
export function sanitizeSearch(value: string): string {
  return value.replace(/[,()%*]/g, " ").trim();
}
