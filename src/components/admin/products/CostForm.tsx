import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { OperationalCost, OperationalCostInput } from "@/hooks/useOperationalCosts";

const costSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.enum(["supplier_payment", "operational", "marketing", "staff", "other"]),
  amount: z.coerce.number().min(0.01, "Amount must be positive"),
  frequency: z.enum(["one_time", "monthly", "annual"]),
  due_date: z.string().optional(),
  status: z.enum(["pending", "paid", "overdue"]),
  notes: z.string().optional(),
});

type CostFormValues = z.infer<typeof costSchema>;

interface CostFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cost?: OperationalCost | null;
  onSubmit: (data: OperationalCostInput) => void;
  isLoading?: boolean;
}

const CATEGORIES = [
  { value: "supplier_payment", label: "Supplier Payment" },
  { value: "operational", label: "Operational" },
  { value: "marketing", label: "Marketing" },
  { value: "staff", label: "Staff" },
  { value: "other", label: "Other" },
] as const;

const FREQUENCIES = [
  { value: "one_time", label: "One-time" },
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual" },
] as const;

const STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
] as const;

export function CostForm({ 
  open, 
  onOpenChange, 
  cost, 
  onSubmit,
  isLoading 
}: CostFormProps) {
  const { t } = useTranslation();
  
  const form = useForm<CostFormValues>({
    resolver: zodResolver(costSchema),
    defaultValues: {
      name: cost?.name ?? "",
      category: cost?.category ?? "other",
      amount: cost?.amount ?? 0,
      frequency: cost?.frequency ?? "one_time",
      due_date: cost?.due_date ?? "",
      status: cost?.status ?? "pending",
      notes: cost?.notes ?? "",
    },
  });

  const handleSubmit = (values: CostFormValues) => {
    onSubmit({
      name: values.name,
      category: values.category,
      amount: values.amount,
      frequency: values.frequency,
      due_date: values.due_date || undefined,
      status: values.status,
      notes: values.notes || undefined,
    });
    onOpenChange(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {cost ? t("admin.products.editCost", "Edit Cost") : t("admin.products.addCost", "Add Cost")}
          </DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common.name", "Name")}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., Monthly Pendant Supplier Invoice" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.category", "Category")}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.amount", "Amount")} (€)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("admin.products.frequency", "Frequency")}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {FREQUENCIES.map((freq) => (
                          <SelectItem key={freq.value} value={freq.value}>
                            {freq.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.status", "Status")}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATUSES.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="due_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("admin.products.dueDate", "Due Date")}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common.notes", "Notes")}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} placeholder="Additional details..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {cost ? t("common.save", "Save") : t("common.create", "Create")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
