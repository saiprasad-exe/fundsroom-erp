import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createChallan } from "@/lib/services/challans";
import { listCustomers } from "@/lib/services/customers";
import { listAllProducts } from "@/lib/services/products";
import { errorMessage } from "@/lib/api-error";
import { challanSchema, type ChallanInput } from "@/lib/validators";

export const Route = createFileRoute("/_authenticated/challans/create")({
  head: () => ({
    meta: [
      { title: "New challan · Fundsroom ERP" },
      {
        name: "description",
        content: "Create a draft delivery challan with customer, line items and quantities.",
      },
      { property: "og:title", content: "New challan · Fundsroom ERP" },
      { property: "og:description", content: "Draft a delivery challan without touching stock." },
    ],
  }),
  component: CreateChallanPage,
});

function CreateChallanPage() {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

  const customers = useQuery({
    queryKey: ["customers", "options"],
    queryFn: () => listCustomers({ page: 1, limit: 100 }),
  });
  const products = useQuery({ queryKey: ["all-products"], queryFn: listAllProducts });

  const form = useForm<ChallanInput>({
    resolver: zodResolver(challanSchema),
    defaultValues: { customer_id: "", notes: "", items: [{ product_id: "", quantity: 1 }] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const items = form.watch("items");

  const total = (items ?? []).reduce((sum, item) => {
    const product = (products.data ?? []).find((p) => p.id === item?.product_id);
    return sum + (product ? Number(product.unit_price) * Number(item.quantity || 0) : 0);
  }, 0);

  const create = useMutation({
    mutationFn: createChallan,
    onSuccess: async (challan) => {
      toast.success(`Draft challan ${challan.challan_number} created`);
      void queryClient.invalidateQueries({ queryKey: ["challans"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await navigate({ to: "/challans/$id", params: { id: challan.id } });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-5">
      <Link
        to="/challans"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to challans
      </Link>

      <div>
        <h1 className="page-title text-foreground">New delivery challan</h1>
        <p className="text-sm text-muted-foreground">
          Saved as a DRAFT — stock is only reserved when you confirm it.
        </p>
      </div>

      <form className="space-y-4" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
        <section className="panel grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="customer_id">Customer *</Label>
            <select
              id="customer_id"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              {...form.register("customer_id")}
            >
              <option value="">Select customer</option>
              {(customers.data?.records ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customer_name}
                  {c.business_name ? ` · ${c.business_name}` : ""}
                </option>
              ))}
            </select>
            {form.formState.errors.customer_id ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.customer_id.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} {...form.register("notes")} />
          </div>
        </section>

        <section className="panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Line items</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ product_id: "", quantity: 1 })}
            >
              <Plus className="size-4" /> Add item
            </Button>
          </div>

          <div className="mt-3 space-y-3">
            {fields.map((field, index) => {
              const selected = (products.data ?? []).find(
                (p) => p.id === items?.[index]?.product_id,
              );
              const qty = Number(items?.[index]?.quantity || 0);
              const insufficient = selected ? qty > selected.current_stock : false;
              return (
                <div key={field.id} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                  <div className="space-y-1.5">
                    <Label htmlFor={`items.${index}.product_id`}>Product *</Label>
                    <select
                      id={`items.${index}.product_id`}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      {...form.register(`items.${index}.product_id` as const)}
                    >
                      <option value="">Select product</option>
                      {(products.data ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.product_name} ({p.sku}) · {p.current_stock} in stock
                        </option>
                      ))}
                    </select>
                    {form.formState.errors.items?.[index]?.product_id ? (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.items[index]?.product_id?.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`items.${index}.quantity`}>Quantity *</Label>
                    <Input
                      id={`items.${index}.quantity`}
                      type="number"
                      min="1"
                      {...form.register(`items.${index}.quantity` as const)}
                    />
                    {form.formState.errors.items?.[index]?.quantity ? (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.items[index]?.quantity?.message}
                      </p>
                    ) : insufficient ? (
                      <p className="text-xs text-warning-foreground">
                        Only {selected?.current_stock} in stock — confirmation will be rejected.
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Line total</Label>
                    <p className="num h-9 leading-9 text-sm">
                      ₹{selected ? (Number(selected.unit_price) * qty).toFixed(2) : "0.00"}
                    </p>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove item"
                      disabled={fields.length === 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {form.formState.errors.items?.message ? (
            <p className="mt-2 text-xs text-destructive">{form.formState.errors.items.message}</p>
          ) : null}

          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <p className="text-sm text-muted-foreground">Estimated total</p>
            <p className="num text-lg font-semibold">₹{total.toFixed(2)}</p>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" type="button">
            <Link to="/challans">Cancel</Link>
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Saving…" : "Save draft challan"}
          </Button>
        </div>
      </form>
    </div>
  );
}
