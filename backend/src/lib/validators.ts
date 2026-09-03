import { z } from "zod";

export const uuid = z.string().uuid("Must be a valid UUID");

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  role: z.enum(["ADMIN", "SALES", "WAREHOUSE", "ACCOUNTS"]),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1, "Password is required"),
});

export const customerSchema = z.object({
  customer_name: z.string().trim().min(2).max(120),
  mobile_number: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile"),
  email: z.string().trim().email().optional().nullable(),
  business_name: z.string().trim().max(160).optional().nullable(),
  gst_number: z
    .string()
    .trim()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Invalid GST number")
    .optional()
    .nullable(),
  customer_type: z.enum(["RETAIL", "WHOLESALE", "DISTRIBUTOR"]).default("RETAIL"),
  status: z.enum(["LEAD", "ACTIVE", "INACTIVE"]).default("LEAD"),
  address: z.string().trim().max(400).optional().nullable(),
  follow_up_date: z.string().date().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const followUpSchema = z.object({
  note: z.string().trim().min(3).max(1000),
  follow_up_date: z.string().date().optional().nullable(),
});

export const productSchema = z.object({
  product_name: z.string().trim().min(2).max(160),
  sku: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[A-Za-z0-9-_]+$/, "SKU may contain letters, numbers, dashes and underscores only"),
  category: z.string().trim().min(2).max(60),
  unit_price: z.coerce.number().min(0),
  current_stock: z.coerce.number().int().min(0).default(0),
  minimum_stock_quantity: z.coerce.number().int().min(0).default(0),
  warehouse_location: z.string().trim().max(60).optional().nullable(),
});

export const productUpdateSchema = productSchema.omit({ sku: true, current_stock: true }).partial();

export const stockAdjustSchema = z.object({
  quantity: z.coerce.number().int().positive("Quantity must be greater than zero"),
  movement_type: z.enum(["IN", "OUT"]),
  reason: z.string().trim().min(3).max(200),
});

export const challanSchema = z.object({
  customer_id: uuid,
  notes: z.string().trim().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        product_id: uuid,
        quantity: z.coerce.number().int().positive("Quantity must be greater than zero"),
      }),
    )
    .min(1, "Add at least one line item"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type ChallanInput = z.infer<typeof challanSchema>;
