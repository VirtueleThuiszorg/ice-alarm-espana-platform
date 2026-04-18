import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Plus, MoreHorizontal, Pencil, Trash2, ArrowUp, ArrowDown, Loader2, MessageSquareQuote } from "lucide-react";
import { useAdminTestimonials, useTestimonialEditor, type Testimonial } from "@/hooks/useTestimonials";
import { TestimonialForm } from "@/components/admin/testimonials/TestimonialForm";

const PAGE_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  landing: { label: "Landing", variant: "default" },
  pendant: { label: "Pendant", variant: "secondary" },
  both: { label: "Both", variant: "outline" },
};

export default function TestimonialsPage() {
  const { t } = useTranslation();
  const { data: testimonials, isLoading } = useAdminTestimonials();
  const { createTestimonial, updateTestimonial, deleteTestimonial, isCreating, isUpdating, isDeleting } = useTestimonialEditor();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Testimonial | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async (data: Parameters<typeof createTestimonial>[0]) => {
    await createTestimonial(data);
  };

  const handleUpdate = async (data: Parameters<typeof createTestimonial>[0]) => {
    if (!editingItem) return;
    await updateTestimonial({ id: editingItem.id, data });
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await deleteTestimonial(deletingId);
    setDeletingId(null);
  };

  const handleMove = async (item: Testimonial, direction: "up" | "down") => {
    if (!testimonials) return;
    const samePage = testimonials.filter((t) => t.page === item.page);
    const idx = samePage.findIndex((t) => t.id === item.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= samePage.length) return;
    const other = samePage[swapIdx];
    await updateTestimonial({ id: item.id, data: { display_order: other.display_order } });
    await updateTestimonial({ id: other.id, data: { display_order: item.display_order } });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquareQuote className="h-6 w-6" />
            {t("adminTestimonials.title", "Testimonials")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("adminTestimonials.subtitle", "Manage customer testimonials displayed on the website.")}
          </p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("adminTestimonials.addTestimonial", "Add Testimonial")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {t("adminTestimonials.totalTestimonials", "Total Testimonials")}: {testimonials?.length || 0}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">{t("adminTestimonials.loading", "Loading testimonials...")}</span>
            </div>
          ) : !testimonials?.length ? (
            <p className="text-center py-12 text-muted-foreground">
              {t("adminTestimonials.noTestimonials", "No testimonials found")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>{t("adminTestimonials.authorName", "Author")}</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Quote (EN)</TableHead>
                  <TableHead>{t("adminTestimonials.page", "Page")}</TableHead>
                  <TableHead>{t("adminTestimonials.rating", "Rating")}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Order</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {testimonials.map((item) => {
                  const pageBadge = PAGE_BADGE[item.page] || PAGE_BADGE.both;
                  return (
                    <TableRow key={item.id} className={!item.is_active ? "opacity-50" : ""}>
                      <TableCell className="text-muted-foreground">{item.display_order}</TableCell>
                      <TableCell className="font-medium">{item.author_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.location_en}</TableCell>
                      <TableCell className="text-sm max-w-[300px] truncate">{item.quote_en}</TableCell>
                      <TableCell>
                        <Badge variant={pageBadge.variant}>{pageBadge.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-amber-500">
                          {"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.is_active ? "default" : "secondary"}>
                          {item.is_active
                            ? t("adminTestimonials.active", "Active")
                            : t("adminTestimonials.inactive", "Inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleMove(item, "up")}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleMove(item, "down")}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingItem(item)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              {t("adminTestimonials.editTestimonial", "Edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeletingId(item.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <TestimonialForm
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        onSubmit={handleCreate}
        isSubmitting={isCreating}
      />

      {/* Edit Dialog */}
      <TestimonialForm
        open={!!editingItem}
        onOpenChange={(open) => { if (!open) setEditingItem(undefined); }}
        onSubmit={handleUpdate}
        initialData={editingItem}
        isSubmitting={isUpdating}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Testimonial</AlertDialogTitle>
            <AlertDialogDescription>
              {t("adminTestimonials.deleteConfirm", "Are you sure you want to delete this testimonial?")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
