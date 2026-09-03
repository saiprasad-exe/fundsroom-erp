import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, Pager, TableSkeleton } from "@/components/DataStates";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CustomerForm } from "@/components/CustomerForm";
import { createCustomer, listCustomers } from "@/lib/services/customers";
import { errorMessage } from "@/lib/api-error";
import { useAuth } from "@/hooks/useAuth";
import { CUSTOMER_STATUSES, CUSTOMER_TYPES, type CustomerStatus, type CustomerType } from "@/types";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Customers · Fundsroom ERP" },
      {
        name: "description",
        content: "Search, filter and manage CRM customer records, leads and follow-ups.",
      },
      { property: "og:title", content: "Customers · Fundsroom ERP" },
      { property: "og:description", content: "CRM customer directory with search and filters." },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const { hasRole } = useAuth();
  const canManage = hasRole("SALES");
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<CustomerStatus | "ALL">("ALL");
  const [type, setType] = useState<CustomerType | "ALL">("ALL");
  const [open, setOpen] = useState(false);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["customers", { page, search, status, type }],
    queryFn: () => listCustomers({ page, limit: 10, search, status, customer_type: type }),
  });

  const create = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      toast.success("Customer created successfully");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title text-foreground">Customers</h1>
          <p className="text-sm text-muted-foreground">CRM directory, leads and follow-ups.</p>
        </div>
        {canManage ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Add customer
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
              placeholder="Search name, mobile, business or email"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Button type="submit" variant="outline" size="icon" aria-label="Search">
              <Search className="size-4" />
            </Button>
          </form>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as CustomerStatus | "ALL");
            }}
          >
            <option value="ALL">All statuses</option>
            {CUSTOMER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={type}
            onChange={(e) => {
              setPage(1);
              setType(e.target.value as CustomerType | "ALL");
            }}
          >
            <option value="ALL">All types</option>
            {CUSTOMER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isPending || !data ? (
          <TableSkeleton cols={5} />
        ) : data.records.length === 0 ? (
          <EmptyState title="No customers found" description="Adjust filters or add a customer." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Customer</th>
                    <th className="px-4 py-2.5">Mobile</th>
                    <th className="px-4 py-2.5">Business</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Follow-up</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.records.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/40">
                      <td className="px-4 py-2.5">
                        <Link
                          to="/customers/$id"
                          params={{ id: c.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {c.customer_name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{c.email ?? "—"}</p>
                      </td>
                      <td className="num px-4 py-2.5">{c.mobile_number}</td>
                      <td className="px-4 py-2.5">{c.business_name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs font-medium">{c.customer_type}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge value={c.status} />
                      </td>
                      <td className="num px-4 py-2.5 text-xs text-muted-foreground">
                        {c.follow_up_date ?? "—"}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add customer</DialogTitle>
          </DialogHeader>
          <CustomerForm
            submitting={create.isPending}
            onSubmit={(values) => create.mutate(values)}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
