import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { customerSchema, type CustomerInput } from "@/lib/validators";
import { CUSTOMER_STATUSES, CUSTOMER_TYPES, type Customer } from "@/types";

export function CustomerForm({
  customer,
  submitting,
  onSubmit,
  onCancel,
}: {
  customer?: Customer;
  submitting?: boolean;
  onSubmit: (values: CustomerInput) => void;
  onCancel?: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      customer_name: customer?.customer_name ?? "",
      mobile_number: customer?.mobile_number ?? "",
      email: customer?.email ?? "",
      business_name: customer?.business_name ?? "",
      gst_number: customer?.gst_number ?? "",
      customer_type: customer?.customer_type ?? "RETAIL",
      status: customer?.status ?? "LEAD",
      address: customer?.address ?? "",
      follow_up_date: customer?.follow_up_date ?? "",
      notes: customer?.notes ?? "",
    },
  });

  const err = (key: keyof CustomerInput) =>
    errors[key] ? <p className="text-xs text-destructive">{errors[key]?.message as string}</p> : null;

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => onSubmit(v))}>
      <div className="space-y-1.5">
        <Label htmlFor="customer_name">Customer name *</Label>
        <Input id="customer_name" {...register("customer_name")} />
        {err("customer_name")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mobile_number">Mobile number *</Label>
        <Input id="mobile_number" inputMode="numeric" {...register("mobile_number")} />
        {err("mobile_number")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register("email")} />
        {err("email")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="business_name">Business name</Label>
        <Input id="business_name" {...register("business_name")} />
        {err("business_name")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="gst_number">GST number</Label>
        <Input id="gst_number" className="uppercase" {...register("gst_number")} />
        {err("gst_number")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="customer_type">Customer type *</Label>
        <select
          id="customer_type"
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          {...register("customer_type")}
        >
          {CUSTOMER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {err("customer_type")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="status">Status *</Label>
        <select
          id="status"
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          {...register("status")}
        >
          {CUSTOMER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {err("status")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="follow_up_date">Next follow-up date</Label>
        <Input id="follow_up_date" type="date" {...register("follow_up_date")} />
        {err("follow_up_date")}
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="address">Address</Label>
        <Textarea id="address" rows={2} {...register("address")} />
        {err("address")}
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={2} {...register("notes")} />
        {err("notes")}
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save customer"}
        </Button>
      </div>
    </form>
  );
}
