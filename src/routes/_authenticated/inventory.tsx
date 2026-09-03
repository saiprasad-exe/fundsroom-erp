import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, Pager, TableSkeleton } from "@/components/DataStates";
import {
  adjustStock,
  listAllProducts,
  listStockMovements,
} from "@/lib/services/products";
import { errorMessage } from "@/lib/api-error";
import { stockAdjustSchema, type StockAdjustInput } from "@/lib/validators";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory · Fundsroom ERP" },
      {
        name: "description",
        content: "Warehouse stock levels, guarded stock adjustments and full movement history.",
      },
      { property: "og:title", content: "Inventory · Fundsroom ERP" },
      { property: "og:description", content: "Stock levels and audited stock movement history." },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const { hasRole } = useAuth();
  const canAdjust = hasRole("WAREHOUSE");
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const products = useQuery({ queryKey: ["all-products"], queryFn: listAllProducts });
  const movements = useQuery({
    queryKey: ["stock-movements", page],
    queryFn: () => listStockMovements({ page, limit: 10 }),
  });

  const form = useForm<StockAdjustInput>({
    resolver: zodResolver(stockAdjustSchema),
    defaultValues: { product_id: "", movement_type: "IN", quantity: 1, reason: "" },
  });

  const adjust = useMutation({
    mutationFn: adjustStock,
    onSuccess: () => {
      toast.success("Stock adjusted and movement recorded");
      form.reset({ product_id: "", movement_type: "IN", quantity: 1, reason: "" });
      void queryClient.invalidateQueries({ queryKey: ["all-products"] });
      void queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title text-foreground">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Stock levels, adjustments and audited movement history.
        </p>
      </div>

      {canAdjust ? (
        <section className="panel p-4">
          <h2 className="text-sm font-semibold">Stock adjustment</h2>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={form.handleSubmit((v) => adjust.mutate(v))}
          >
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="product_id">Product *</Label>
              <select
                id="product_id"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                {...form.register("product_id")}
              >
                <option value="">Select product</option>
                {(products.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.product_name} ({p.sku}) · {p.current_stock} in stock
                  </option>
                ))}
              </select>
              {form.formState.errors.product_id ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.product_id.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="movement_type">Movement *</Label>
              <select
                id="movement_type"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                {...form.register("movement_type")}
              >
                <option value="IN">IN</option>
                <option value="OUT">OUT</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input id="quantity" type="number" min="1" {...form.register("quantity")} />
              {form.formState.errors.quantity ? (
                <p className="text-xs text-destructive">{form.formState.errors.quantity.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason *</Label>
              <Input id="reason" placeholder="Purchase, damage, correction…" {...form.register("reason")} />
              {form.formState.errors.reason ? (
                <p className="text-xs text-destructive">{form.formState.errors.reason.message}</p>
              ) : null}
            </div>
            <div className="lg:col-span-5">
              <Button type="submit" disabled={adjust.isPending}>
                {adjust.isPending ? "Applying…" : "Apply adjustment"}
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="panel">
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Stock levels</h2>
        </header>
        {products.error ? (
          <ErrorState message={errorMessage(products.error)} onRetry={() => void products.refetch()} />
        ) : products.isPending ? (
          <TableSkeleton cols={5} />
        ) : (products.data ?? []).length === 0 ? (
          <EmptyState title="No products yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Product</th>
                  <th className="px-4 py-2.5">Current stock</th>
                  <th className="px-4 py-2.5">Minimum</th>
                  <th className="px-4 py-2.5">Warehouse</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(products.data ?? []).map((p) => {
                  const low = p.current_stock <= p.minimum_stock_quantity;
                  return (
                    <tr key={p.id} className="hover:bg-muted/40">
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{p.product_name}</p>
                        <p className="num text-xs text-muted-foreground">{p.sku}</p>
                      </td>
                      <td className="num px-4 py-2.5">{p.current_stock}</td>
                      <td className="num px-4 py-2.5">{p.minimum_stock_quantity}</td>
                      <td className="px-4 py-2.5">{p.warehouse_location ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge value={low ? "LOW" : "OK"} label={low ? "Low stock" : "In stock"} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Stock movement history</h2>
        </header>
        {movements.error ? (
          <ErrorState
            message={errorMessage(movements.error)}
            onRetry={() => void movements.refetch()}
          />
        ) : movements.isPending || !movements.data ? (
          <TableSkeleton cols={5} />
        ) : movements.data.records.length === 0 ? (
          <EmptyState title="No stock movements recorded" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Quantity</th>
                    <th className="px-4 py-2.5">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {movements.data.records.map((m) => (
                    <tr key={m.id} className="hover:bg-muted/40">
                      <td className="num px-4 py-2.5 text-xs text-muted-foreground">
                        {new Date(m.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{m.products?.product_name ?? "—"}</p>
                        <p className="num text-xs text-muted-foreground">{m.products?.sku}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge value={m.movement_type} />
                      </td>
                      <td className="num px-4 py-2.5">
                        {m.quantity_changed > 0 ? `+${m.quantity_changed}` : m.quantity_changed}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{m.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={movements.data.page}
              totalPages={movements.data.totalPages}
              totalRecords={movements.data.totalRecords}
              onPageChange={setPage}
            />
          </>
        )}
      </section>
    </div>
  );
}
