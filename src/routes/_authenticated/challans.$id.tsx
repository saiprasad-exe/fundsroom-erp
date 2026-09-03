import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState, TableSkeleton } from "@/components/DataStates";
import { cancelChallan, confirmChallan, getChallan } from "@/lib/services/challans";
import { errorMessage } from "@/lib/api-error";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/challans/$id")({
  head: () => ({
    meta: [
      { title: "Challan detail · Fundsroom ERP" },
      {
        name: "description",
        content:
          "Challan line items with product snapshots, plus transactional confirm and cancel actions.",
      },
      { property: "og:title", content: "Challan detail · Fundsroom ERP" },
      {
        property: "og:description",
        content: "Confirm a challan to decrement stock atomically, or cancel the draft.",
      },
    ],
  }),
  component: ChallanDetailPage,
});

function ChallanDetailPage() {
  const { id } = Route.useParams();
  const { hasRole } = useAuth();
  const canAct = hasRole("SALES", "WAREHOUSE");
  const queryClient = useQueryClient();

  const challan = useQuery({ queryKey: ["challan", id], queryFn: () => getChallan(id) });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["challan", id] });
    void queryClient.invalidateQueries({ queryKey: ["challans"] });
    void queryClient.invalidateQueries({ queryKey: ["all-products"] });
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const confirm = useMutation({
    mutationFn: () => confirmChallan(id),
    onSuccess: () => {
      toast.success("Challan confirmed — stock decremented and OUT movements recorded");
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const cancel = useMutation({
    mutationFn: () => cancelChallan(id),
    onSuccess: () => {
      toast.success("Challan cancelled — stock untouched");
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (challan.error)
    return (
      <ErrorState message={errorMessage(challan.error)} onRetry={() => void challan.refetch()} />
    );

  return (
    <div className="space-y-5">
      <Link
        to="/challans"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to challans
      </Link>

      {challan.isPending || !challan.data ? (
        <div className="panel">
          <TableSkeleton rows={5} cols={4} />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="page-title num text-foreground">{challan.data.challan_number}</h1>
              <div className="mt-1 flex items-center gap-2">
                <StatusBadge value={challan.data.status} />
                <span className="text-xs text-muted-foreground">
                  {challan.data.customers?.customer_name}
                  {challan.data.customers?.business_name
                    ? ` · ${challan.data.customers.business_name}`
                    : ""}
                </span>
              </div>
            </div>
            {canAct && challan.data.status === "DRAFT" ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={cancel.isPending}
                  onClick={() => {
                    if (confirm.isPending) return;
                    if (window.confirm("Cancel this draft challan?")) cancel.mutate();
                  }}
                >
                  <XCircle className="size-4" /> Cancel challan
                </Button>
                <Button disabled={confirm.isPending} onClick={() => confirm.mutate()}>
                  <CheckCircle2 className="size-4" />
                  {confirm.isPending ? "Confirming…" : "Confirm challan"}
                </Button>
              </div>
            ) : null}
          </div>

          {challan.data.status === "CONFIRMED" ? (
            <p className="rounded-md border border-success/25 bg-success/10 px-3 py-2 text-sm text-success">
              Confirmed{" "}
              {challan.data.confirmed_at
                ? `on ${new Date(challan.data.confirmed_at).toLocaleString()}`
                : ""}
              . Stock was decremented and OUT movements recorded. This challan can no longer be
              modified or re-confirmed.
            </p>
          ) : null}
          {challan.data.status === "CANCELLED" ? (
            <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              This challan was cancelled. Stock was never affected.
            </p>
          ) : null}

          <section className="panel">
            <header className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Line items (snapshotted at draft time)</h2>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-4 py-2.5">SKU</th>
                    <th className="px-4 py-2.5">Unit price</th>
                    <th className="px-4 py-2.5">Quantity</th>
                    <th className="px-4 py-2.5">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {challan.data.challan_items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2.5 font-medium">{item.product_name_snapshot}</td>
                      <td className="num px-4 py-2.5">{item.sku_snapshot}</td>
                      <td className="num px-4 py-2.5">
                        ₹{Number(item.unit_price_snapshot).toFixed(2)}
                      </td>
                      <td className="num px-4 py-2.5">{item.quantity}</td>
                      <td className="num px-4 py-2.5">
                        ₹{(Number(item.unit_price_snapshot) * item.quantity).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Total quantity <span className="num">{challan.data.total_quantity}</span>
              </p>
              <p className="num text-lg font-semibold">
                ₹{Number(challan.data.total_amount).toFixed(2)}
              </p>
            </div>
          </section>

          {challan.data.notes ? (
            <section className="panel p-4">
              <h2 className="text-sm font-semibold">Notes</h2>
              <p className="mt-1 text-sm text-muted-foreground">{challan.data.notes}</p>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
