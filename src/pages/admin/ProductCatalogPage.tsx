import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, ExternalLink, Loader2 } from "lucide-react";

interface CatalogProduct {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  category: string | null;
  display_order: number;
  hero_image_url: string | null;
  selling_price_net: number;
  selling_tax_rate: number;
  cost_price: number;
  is_active: boolean;
  sku: string | null;
  supplier_name: string | null;
  name_i18n: Record<string, string>;
  short_description_i18n: Record<string, string>;
  long_description_i18n: Record<string, string>;
  features_i18n: Record<string, string[]>;
}

const LANGUAGES = ["en", "es", "nl"] as const;
const LANG_LABELS: Record<string, string> = { en: "English", es: "Spanish", nl: "Dutch" };
const STATUS_OPTIONS = ["active", "coming_soon", "inactive"] as const;
const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  coming_soon: "bg-blue-100 text-blue-800",
  inactive: "bg-gray-100 text-gray-500",
};

const emptyProduct: Omit<CatalogProduct, "id"> = {
  name: "",
  slug: null,
  status: "coming_soon",
  category: null,
  display_order: 0,
  hero_image_url: null,
  selling_price_net: 0,
  selling_tax_rate: 0.21,
  cost_price: 0,
  is_active: false,
  sku: null,
  supplier_name: null,
  name_i18n: { en: "", es: "", nl: "" },
  short_description_i18n: { en: "", es: "", nl: "" },
  long_description_i18n: { en: "", es: "", nl: "" },
  features_i18n: { en: [], es: [], nl: [] },
};

function useAdminProducts() {
  return useQuery({
    queryKey: ["admin-products-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("display_order");
      if (error) throw error;
      return data as CatalogProduct[];
    },
  });
}

export default function ProductCatalogPage() {
  const queryClient = useQueryClient();
  const { data: products, isLoading } = useAdminProducts();
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CatalogProduct | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (product: Partial<CatalogProduct> & { id?: string }) => {
      const { id, ...data } = product;
      if (id) {
        const { error } = await supabase.from("products").update(data).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products-catalog"] });
      toast.success(isNewProduct ? "Product created" : "Product updated");
      setDialogOpen(false);
      setEditingProduct(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products-catalog"] });
      toast.success("Product deleted");
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openNew = () => {
    setEditingProduct(emptyProduct as CatalogProduct);
    setIsNewProduct(true);
    setDialogOpen(true);
  };

  const openEdit = (p: CatalogProduct) => {
    setEditingProduct({ ...p });
    setIsNewProduct(false);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!editingProduct) return;
    const payload: Record<string, unknown> = { ...editingProduct };
    if (isNewProduct) delete payload.id;
    payload.is_active = editingProduct.status === "active";
    saveMutation.mutate(payload as Partial<CatalogProduct> & { id?: string });
  };

  const updateField = (field: string, value: unknown) => {
    if (!editingProduct) return;
    setEditingProduct({ ...editingProduct, [field]: value });
  };

  const updateI18n = (field: string, lang: string, value: string) => {
    if (!editingProduct) return;
    const current = (editingProduct as Record<string, Record<string, string>>)[field] ?? {};
    setEditingProduct({ ...editingProduct, [field]: { ...current, [lang]: value } });
  };

  const updateFeatures = (lang: string, value: string) => {
    if (!editingProduct) return;
    const current = editingProduct.features_i18n ?? {};
    setEditingProduct({
      ...editingProduct,
      features_i18n: { ...current, [lang]: value.split("\n").filter(Boolean) },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Product Catalog</h1>
          <p className="text-muted-foreground text-sm">Manage products visible on the public website</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Add Product
        </Button>
      </div>

      <div className="grid gap-4">
        {products?.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-16 h-16 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
                {p.hero_image_url ? (
                  <img src={p.hero_image_url} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No img</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold truncate">{p.name}</span>
                  <Badge className={`text-xs ${STATUS_COLORS[p.status] ?? ""}`} variant="secondary">
                    {p.status === "coming_soon" ? "Coming Soon" : p.status}
                  </Badge>
                  {p.category && <Badge variant="outline" className="text-xs">{p.category}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {p.slug ? `/products/${p.slug}` : "No slug"} · Order: {p.display_order} · Net: €{p.selling_price_net.toFixed(2)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {p.slug && (
                  <a href={`/products/${p.slug}`} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="icon" title="Preview">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                )}
                <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(p)} title="Delete" className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNewProduct ? "Add Product" : "Edit Product"}</DialogTitle>
          </DialogHeader>
          {editingProduct && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Internal Name</Label>
                  <Input value={editingProduct.name} onChange={(e) => updateField("name", e.target.value)} />
                </div>
                <div>
                  <Label>Slug (URL)</Label>
                  <Input value={editingProduct.slug ?? ""} onChange={(e) => updateField("slug", e.target.value)} placeholder="e.g. pill-dispenser" />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={editingProduct.status} onValueChange={(v) => updateField("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s === "coming_soon" ? "Coming Soon" : s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Category</Label>
                  <Input value={editingProduct.category ?? ""} onChange={(e) => updateField("category", e.target.value)} placeholder="e.g. Emergency" />
                </div>
                <div>
                  <Label>Display Order</Label>
                  <Input type="number" value={editingProduct.display_order} onChange={(e) => updateField("display_order", parseInt(e.target.value) || 0)} />
                </div>
                <div>
                  <Label>Hero Image URL</Label>
                  <Input value={editingProduct.hero_image_url ?? ""} onChange={(e) => updateField("hero_image_url", e.target.value)} placeholder="https://..." />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Net Price (€)</Label>
                  <Input type="number" step="0.01" value={editingProduct.selling_price_net} onChange={(e) => updateField("selling_price_net", parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <Label>Tax Rate</Label>
                  <Input type="number" step="0.01" value={editingProduct.selling_tax_rate} onChange={(e) => updateField("selling_tax_rate", parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <Label>Cost Price (€)</Label>
                  <Input type="number" step="0.01" value={editingProduct.cost_price} onChange={(e) => updateField("cost_price", parseFloat(e.target.value) || 0)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>SKU</Label>
                  <Input value={editingProduct.sku ?? ""} onChange={(e) => updateField("sku", e.target.value)} />
                </div>
                <div>
                  <Label>Supplier</Label>
                  <Input value={editingProduct.supplier_name ?? ""} onChange={(e) => updateField("supplier_name", e.target.value)} />
                </div>
              </div>

              {/* i18n fields */}
              {(["name_i18n", "short_description_i18n", "long_description_i18n"] as const).map((field) => (
                <div key={field}>
                  <Label className="capitalize mb-2 block">{field.replace(/_i18n$/, "").replace(/_/g, " ")}</Label>
                  <Tabs defaultValue="en">
                    <TabsList>
                      {LANGUAGES.map((lang) => <TabsTrigger key={lang} value={lang}>{LANG_LABELS[lang]}</TabsTrigger>)}
                    </TabsList>
                    {LANGUAGES.map((lang) => (
                      <TabsContent key={lang} value={lang}>
                        {field === "long_description_i18n" ? (
                          <textarea
                            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={((editingProduct as Record<string, Record<string, string>>)[field] ?? {})[lang] ?? ""}
                            onChange={(e) => updateI18n(field, lang, e.target.value)}
                          />
                        ) : (
                          <Input
                            value={((editingProduct as Record<string, Record<string, string>>)[field] ?? {})[lang] ?? ""}
                            onChange={(e) => updateI18n(field, lang, e.target.value)}
                          />
                        )}
                      </TabsContent>
                    ))}
                  </Tabs>
                </div>
              ))}

              <div>
                <Label className="mb-2 block">Features (one per line)</Label>
                <Tabs defaultValue="en">
                  <TabsList>
                    {LANGUAGES.map((lang) => <TabsTrigger key={lang} value={lang}>{LANG_LABELS[lang]}</TabsTrigger>)}
                  </TabsList>
                  {LANGUAGES.map((lang) => (
                    <TabsContent key={lang} value={lang}>
                      <textarea
                        className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={(editingProduct.features_i18n?.[lang] ?? []).join("\n")}
                        onChange={(e) => updateFeatures(lang, e.target.value)}
                      />
                    </TabsContent>
                  ))}
                </Tabs>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {isNewProduct ? "Create" : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
