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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { Product, ProductInput } from "@/hooks/useProducts";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().optional(),
  description: z.string().optional(),
  selling_price_net: z.coerce.number().min(0, "Must be positive"),
  selling_tax_rate: z.coerce.number().min(0).max(1, "Must be between 0 and 1"),
  cost_price: z.coerce.number().min(0, "Must be positive"),
  supplier_name: z.string().optional(),
  is_active: z.boolean(),
});

type ProductFormValues = z.infer<typeof productSchema>;

interface ProductFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  onSubmit: (data: ProductInput) => void;
  isLoading?: boolean;
}

export function ProductForm({ 
  open, 
  onOpenChange, 
  product, 
  onSubmit,
  isLoading 
}: ProductFormProps) {
  const { t } = useTranslation();
  
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name ?? "",
      sku: product?.sku ?? "",
      description: product?.description ?? "",
      selling_price_net: product?.selling_price_net ?? 0,
      selling_tax_rate: product?.selling_tax_rate ?? 0.21,
      cost_price: product?.cost_price ?? 0,
      supplier_name: product?.supplier_name ?? "",
      is_active: product?.is_active ?? true,
    },
  });

  const handleSubmit = (values: ProductFormValues) => {
    onSubmit({
      name: values.name,
      sku: values.sku || undefined,
      description: values.description || undefined,
      selling_price_net: values.selling_price_net,
      selling_tax_rate: values.selling_tax_rate,
      cost_price: values.cost_price,
      supplier_name: values.supplier_name || undefined,
      is_active: values.is_active,
    });
    onOpenChange(false);
    form.reset();
  };

  const watchNetPrice = form.watch("selling_price_net");
  const watchTaxRate = form.watch("selling_tax_rate");
  const watchCostPrice = form.watch("cost_price");
  
  const sellingFinal = watchNetPrice * (1 + watchTaxRate);
  const margin = watchNetPrice - watchCostPrice;
  const marginPercent = watchNetPrice > 0 ? (margin / watchNetPrice) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {product ? t("admin.products.editProduct", "Edit Product") : t("admin.products.addProduct", "Add Product")}
          </DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.name", "Name")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common.description", "Description")}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="selling_price_net"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("admin.products.sellingPriceNet", "Selling Price (Net)")}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="selling_tax_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("admin.products.taxRate", "Tax Rate")}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="cost_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("admin.products.costPrice", "Cost Price")}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Live calculations */}
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("admin.products.sellingFinal", "Selling Price (incl. tax)")}</span>
                <span className="font-medium">€{sellingFinal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("admin.products.margin", "Margin")}</span>
                <span className={`font-medium ${margin >= 0 ? "text-green-600" : "text-destructive"}`}>
                  €{margin.toFixed(2)} ({marginPercent.toFixed(1)}%)
                </span>
              </div>
            </div>
            
            <FormField
              control={form.control}
              name="supplier_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("admin.products.supplier", "Supplier")}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t("admin.products.supplierPlaceholder", "Supplier company name")} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <FormLabel className="cursor-pointer">{t("admin.products.active", "Active")}</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {product ? t("common.save", "Save") : t("common.create", "Create")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
