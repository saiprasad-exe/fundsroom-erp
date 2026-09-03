import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ClipboardCheck, FileText, Package, Users } from "lucide-react";
import { getDashboardSummary } from "@/lib/services/dashboard";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/DataStates";
import { errorMessage } from "@/lib/api-error";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · Fundsroom ERP" },
      {
        name: "description",
        content: "Operational overview: customers, products, low stock and challan activity.",
      },
      { property: "og:title", content: "Dashboard · Fundsroom ERP" },
      { property: "og:description", content: "Live ERP and CRM operational summary." },
    ],
  }),
  component: DashboardPage,
});

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  tone?: string;
}) {
  return (
    <div className="panel flex items-center gap-3 p-4">
      <span className={`rounded-md p-2 ${tone ?? "bg-accent text-accent-foreground"}`}>
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="num text-2xl font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function DashboardPage() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboardSummary,
  });

  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Snapshot of CRM, inventory and sales challan activity.
        </p>
      </div>

      {isPending || !data ? (
        <div className="panel">
          <TableSkeleton rows={4} cols={4} />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Customers" value={data.totalCustomers} icon={Users} />
            <StatCard label="Products" value={data.totalProducts} icon={Package} />
            <StatCard
              label="Low stock"
              value={data.lowStockProducts.length}
              icon={AlertTriangle}
              tone="bg-warning/15 text-warning-foreground"
            />
            <StatCard label="Draft challans" value={data.draftChallans} icon={FileText} />
            <StatCard
              label="Confirmed challans"
              value={data.confirmedChallans}
              icon={ClipboardCheck}
              tone="bg-success/12 text-success"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="panel">
              <header className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Low stock products</h2>
                <Link to="/inventory" className="text-xs font-medium text-primary hover:underline">
                  Manage inventory
                </Link>
              </header>
              {data.lowStockProducts.length === 0 ? (
                <EmptyState title="All products above minimum stock" />
              ) : (
                <ul className="divide-y divide-border">
                  {data.lowStockProducts.slice(0, 6).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.product_name}</p>
                        <p className="num text-xs text-muted-foreground">{p.sku}</p>
                      </div>
                      <p className="num text-xs text-muted-foreground">
                        {p.current_stock} / min {p.minimum_stock_quantity}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel">
              <header className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Recent challans</h2>
                <Link to="/challans" className="text-xs font-medium text-primary hover:underline">
                  View all
                </Link>
              </header>
              {data.recentChallans.length === 0 ? (
                <EmptyState title="No challans yet" />
              ) : (
                <ul className="divide-y divide-border">
                  {data.recentChallans.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <Link
                          to="/challans/$id"
                          params={{ id: c.id }}
                          className="num text-sm font-medium text-primary hover:underline"
                        >
                          {c.challan_number}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.customers?.customer_name ?? "—"}
                        </p>
                      </div>
                      <StatusBadge value={c.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="panel">
            <header className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Recent stock movements</h2>
            </header>
            {data.recentMovements.length === 0 ? (
              <EmptyState title="No stock movements recorded" />
            ) : (
              <ul className="divide-y divide-border">
                {data.recentMovements.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {m.products?.product_name ?? "Product"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{m.reason}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="num text-sm">
                        {m.quantity_changed > 0 ? `+${m.quantity_changed}` : m.quantity_changed}
                      </span>
                      <StatusBadge value={m.movement_type} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
