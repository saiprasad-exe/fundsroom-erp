import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState, EmptyState, TableSkeleton } from "@/components/DataStates";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CustomerForm } from "@/components/CustomerForm";
import {
  addFollowUp,
  deleteCustomer,
  getCustomer,
  listFollowUps,
  updateCustomer,
} from "@/lib/services/customers";
import { errorMessage } from "@/lib/api-error";
import { followUpSchema, type FollowUpInput } from "@/lib/validators";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/customers/$id")({
  head: () => ({
    meta: [
      { title: "Customer detail · Fundsroom ERP" },
      {
        name: "description",
        content: "Customer profile, contact details, status and full follow-up history.",
      },
      { property: "og:title", content: "Customer detail · Fundsroom ERP" },
      { property: "og:description", content: "CRM customer profile and follow-up timeline." },
    ],
  }),
  component: CustomerDetailPage,
});

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

function CustomerDetailPage() {
  const { id } = Route.useParams();
  const navigate = Route.useNavigate();
  const { hasRole } = useAuth();
  const canManage = hasRole("SALES");
  const canDelete = hasRole();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const customer = useQuery({ queryKey: ["customer", id], queryFn: () => getCustomer(id) });
  const followUps = useQuery({ queryKey: ["follow-ups", id], queryFn: () => listFollowUps(id) });

  const update = useMutation({
    mutationFn: (values: Parameters<typeof updateCustomer>[1]) => updateCustomer(id, values),
    onSuccess: () => {
      toast.success("Customer updated successfully");
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ["customer", id] });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => deleteCustomer(id),
    onSuccess: async () => {
      toast.success("Customer deleted");
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      await navigate({ to: "/customers" });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const followUpForm = useForm<FollowUpInput>({
    resolver: zodResolver(followUpSchema),
    defaultValues: { note: "", follow_up_date: "" },
  });

  const addNote = useMutation({
    mutationFn: (values: FollowUpInput) => addFollowUp(id, values),
    onSuccess: () => {
      toast.success("Follow-up added");
      followUpForm.reset({ note: "", follow_up_date: "" });
      void queryClient.invalidateQueries({ queryKey: ["follow-ups", id] });
      void queryClient.invalidateQueries({ queryKey: ["customer", id] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (customer.error)
    return <ErrorState message={errorMessage(customer.error)} onRetry={() => void customer.refetch()} />;

  return (
    <div className="space-y-5">
      <Link to="/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to customers
      </Link>

      {customer.isPending || !customer.data ? (
        <div className="panel">
          <TableSkeleton rows={4} cols={3} />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="page-title text-foreground">{customer.data.customer_name}</h1>
              <div className="mt-1 flex items-center gap-2">
                <StatusBadge value={customer.data.status} />
                <span className="text-xs font-medium text-muted-foreground">
                  {customer.data.customer_type}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              {canManage ? (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" /> Edit
                </Button>
              ) : null}
              {canDelete ? (
                <Button
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm("Delete this customer? This cannot be undone.")) remove.mutate();
                  }}
                >
                  <Trash2 className="size-4" /> Delete
                </Button>
              ) : null}
            </div>
          </div>

          <section className="panel grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Mobile" value={customer.data.mobile_number} />
            <Field label="Email" value={customer.data.email} />
            <Field label="Business" value={customer.data.business_name} />
            <Field label="GST number" value={customer.data.gst_number} />
            <Field label="Next follow-up" value={customer.data.follow_up_date} />
            <Field label="Created" value={new Date(customer.data.created_at).toLocaleString()} />
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Address" value={customer.data.address} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Notes" value={customer.data.notes} />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            {canManage ? (
              <section className="panel p-4">
                <h2 className="text-sm font-semibold">Add follow-up</h2>
                <form
                  className="mt-3 space-y-3"
                  onSubmit={followUpForm.handleSubmit((v) => addNote.mutate(v))}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="note">Note *</Label>
                    <Textarea id="note" rows={3} {...followUpForm.register("note")} />
                    {followUpForm.formState.errors.note ? (
                      <p className="text-xs text-destructive">
                        {followUpForm.formState.errors.note.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="follow_up_date">Next follow-up date</Label>
                    <Input id="follow_up_date" type="date" {...followUpForm.register("follow_up_date")} />
                  </div>
                  <Button type="submit" disabled={addNote.isPending}>
                    {addNote.isPending ? "Saving…" : "Add follow-up"}
                  </Button>
                </form>
              </section>
            ) : null}

            <section className="panel">
              <header className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Follow-up history</h2>
              </header>
              {followUps.isPending ? (
                <TableSkeleton rows={3} cols={2} />
              ) : (followUps.data ?? []).length === 0 ? (
                <EmptyState title="No follow-ups yet" />
              ) : (
                <ul className="divide-y divide-border">
                  {(followUps.data ?? []).map((f) => (
                    <li key={f.id} className="px-4 py-3">
                      <p className="text-sm text-foreground">{f.note}</p>
                      <p className="num mt-1 text-xs text-muted-foreground">
                        {new Date(f.created_at).toLocaleString()}
                        {f.follow_up_date ? ` · next: ${f.follow_up_date}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <Dialog open={editing} onOpenChange={setEditing}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit customer</DialogTitle>
              </DialogHeader>
              <CustomerForm
                customer={customer.data}
                submitting={update.isPending}
                onSubmit={(values) => update.mutate(values)}
                onCancel={() => setEditing(false)}
              />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
