import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, Pager, TableSkeleton } from "@/components/DataStates";
import { listChallans } from "@/lib/services/challans";
import { listCustomers } from "@/lib/services/customers";
import { errorMessage } from "@/lib/api-error";
import { CHALLAN_STATUSES, type ChallanStatus } from "@/types";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/challans/")({
  head: () => ({
    meta: [
      { title: "Delivery challans · Fundsroom ERP" },
      {
        name: "description",
        content:
          "Draft, confirm and track delivery challans with product snapshots and stock-safe confirmation.",
      },
      { property: "og:title", content: "Delivery challans · Fundsroom ERP" },
      {
        property: "og:description",
        content: "Challan pipeline from draft to transactional confirmation.",
      },
    ],
  }),
  component: ChallansList,
});

function ChallansList() {
  const { hasRole } = useAuth();
  const canCreate = hasRole("SALES");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ChallanStatus | "ALL">("ALL");
  const [customerId, setCustomerId] = useState<string>("ALL");

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["challans", { page, status, customerId }],
    queryFn: () => listChallans({ page, limit: 10, status, customerId }),
  });
  const customers = useQuery({
    queryKey: ["customers", "options"],
    queryFn: () => listCustomers({ page: 1, limit: 100 }),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title text-foreground">Delivery challans</h1>
          <p className="text-sm text-muted-foreground">
            Drafts never touch stock. Confirmation is transactional and all-or-nothing.
          </p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link to="/challans/create">
              <Plus className="size-4" /> New challan
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as ChallanStatus | "ALL");
            }}
          >
            <option value="ALL">All statuses</option>
            {CHALLAN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={customerId}
            onChange={(e) => {
              setPage(1);
              setCustomerId(e.target.value);
            }}
          >
            <option value="ALL">All customers</option>
            {(customers.data?.records ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.customer_name}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isPending || !data ? (
          <TableSkeleton cols={5} />
        ) : data.records.length === 0 ? (
          <EmptyState title="No challans found" description="Create a draft challan to get started." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Challan</th>
                    <th className="px-4 py-2.5">Customer</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Qty</th>
                    <th className="px-4 py-2.5">Total</th>
                    <th className="px-4 py-2.5">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.records.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/40">
                      <td className="px-4 py-2.5">
                        <Link
                          to="/challans/$id"
                          params={{ id: c.id }}
                          className="num font-medium text-primary hover:underline"
                        >
                          {c.challan_number}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{c.customers?.customer_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{c.customers?.business_name}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge value={c.status} />
                      </td>
                      <td className="num px-4 py-2.5">{c.total_quantity}</td>
                      <td className="num px-4 py-2.5">₹{Number(c.total_amount).toFixed(2)}</td>
                      <td className="num px-4 py-2.5 text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
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
    </div>
  );
}
