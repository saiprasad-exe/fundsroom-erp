import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, Pager, TableSkeleton } from "@/components/DataStates";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProductForm } from "@/components/ProductForm";
import {
  createProduct,
  listCategories,
  listProducts,
  updateProduct,
} from "@/lib/services/products";
import { errorMessage } from "@/lib/api-error";
import { useAuth } from "@/hooks/useAuth";
import type { Product } from "@/types";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "Products · Fundsroom ERP" },
      {
        name: "description",
        content: "Product catalogue with SKU, pricing, category filters and low-stock indicators.",
      },
      { property: "og:title", content: "Products · Fundsroom ERP" },
      { property: "og:description", content: "Wholesale product catalogue and stock levels." },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const { hasRole } = useAuth();
  const canManage = hasRole("WAREHOUSE");
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState<string>("ALL");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["products", { page, search, category, lowStockOnly }],
    queryFn: () => listProducts({ page, limit: 10, search, category, lowStockOnly }),
  });
  const categories = useQuery({ queryKey: ["categories"], queryFn: listCategories });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const create = useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      toast.success("Product created successfully");
      setCreating(false);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const update = useMutation({
    mutationFn: (values: Parameters<typeof updateProduct>[1]) => updateProduct(editing!.id, values),
    onSuccess: () => {
      toast.success("Product updated successfully");
      setEditing(null);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title text-foreground">Products</h1>
          <p className="text-sm text-muted-foreground">Catalogue, pricing and stock levels.</p>
        </div>
        {canManage ? (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Add product
          </Button>
        ) : null}
      </div>

      <div className="panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <form
            className="flex flex-1 min-w-[220px] gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSearch(searchInput);
            }}
          >
            <Input
              placeholder="Search product, SKU or category"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Button type="submit" variant="outline" size="icon" aria-label="Search">
              <Search className="size-4" />
            </Button>
          </form>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={category}
            onChange={(e) => {
              setPage(1);
              setCategory(e.target.value);
            }}
          >
            <option value="ALL">All categories</option>
            {(categories.data ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(e) => {
                setPage(1);
                setLowStockOnly(e.target.checked);
              }}
            />
            Low stock only
          </label>
        </div>

        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isPending || !data ? (
          <TableSkeleton cols={6} />
        ) : data.records.length === 0 ? (
          <EmptyState title="No products found" description="Adjust filters or add a product." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-4 py-2.5">Category</th>
                    <th className="px-4 py-2.5">Unit price</th>
                    <th className="px-4 py-2.5">Stock</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Location</th>
                    {canManage ? <th className="px-4 py-2.5" /> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.records.map((p) => {
                    const low = p.current_stock <= p.minimum_stock_quantity;
                    return (
                      <tr key={p.id} className="hover:bg-muted/40">
                        <td className="px-4 py-2.5">
                          <p className="font-medium">{p.product_name}</p>
                          <p className="num text-xs text-muted-foreground">{p.sku}</p>
                        </td>
                        <td className="px-4 py-2.5">{p.category}</td>
                        <td className="num px-4 py-2.5">₹{Number(p.unit_price).toFixed(2)}</td>
                        <td className="num px-4 py-2.5">
                          {p.current_stock}{" "}
                          <span className="text-xs text-muted-foreground">
                            / min {p.minimum_stock_quantity}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge value={low ? "LOW" : "OK"} label={low ? "Low stock" : "In stock"} />
                        </td>
                        <td className="px-4 py-2.5">{p.warehouse_location ?? "—"}</td>
                        {canManage ? (
                          <td className="px-4 py-2.5 text-right">
                            <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                              <Pencil className="size-4" />
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager
              page={data.page}
              totalPages={data.totalPages}
              totalRecords={data.totalRecords}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add product</DialogTitle>
          </DialogHeader>
          <ProductForm
            submitting={create.isPending}
            onSubmit={(values) => create.mutate(values)}
            onCancel={() => setCreating(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit product</DialogTitle>
          </DialogHeader>
          {editing ? (
            <ProductForm
              product={editing}
              submitting={update.isPending}
              onSubmit={(values) => update.mutate(values)}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
