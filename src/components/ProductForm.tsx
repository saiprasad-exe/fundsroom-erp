import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { productSchema, type ProductInput } from "@/lib/validators";
import type { Product } from "@/types";

export function ProductForm({
  product,
  submitting,
  onSubmit,
  onCancel,
}: {
  product?: Product;
  submitting?: boolean;
  onSubmit: (values: ProductInput) => void;
  onCancel?: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      product_name: product?.product_name ?? "",
      sku: product?.sku ?? "",
      category: product?.category ?? "",
      unit_price: product?.unit_price ?? 0,
      current_stock: product?.current_stock ?? 0,
      minimum_stock_quantity: product?.minimum_stock_quantity ?? 0,
      warehouse_location: product?.warehouse_location ?? "",
    },
  });

  const err = (key: keyof ProductInput) =>
    errors[key] ? <p className="text-xs text-destructive">{errors[key]?.message as string}</p> : null;

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => onSubmit(v))}>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="product_name">Product name *</Label>
        <Input id="product_name" {...register("product_name")} />
        {err("product_name")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sku">SKU *</Label>
        <Input id="sku" className="uppercase" disabled={!!product} {...register("sku")} />
        {err("sku")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="category">Category *</Label>
        <Input id="category" {...register("category")} />
        {err("category")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="unit_price">Unit price *</Label>
        <Input id="unit_price" type="number" step="0.01" min="0" {...register("unit_price")} />
        {err("unit_price")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="minimum_stock_quantity">Minimum stock *</Label>
        <Input
          id="minimum_stock_quantity"
          type="number"
          min="0"
          {...register("minimum_stock_quantity")}
        />
        {err("minimum_stock_quantity")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="current_stock">
          Opening stock {product ? "(adjust via Inventory)" : "*"}
        </Label>
        <Input
          id="current_stock"
          type="number"
          min="0"
          disabled={!!product}
          {...register("current_stock")}
        />
        {err("current_stock")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="warehouse_location">Warehouse location</Label>
        <Input id="warehouse_location" {...register("warehouse_location")} />
        {err("warehouse_location")}
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save product"}
        </Button>
      </div>
    </form>
  );
}
