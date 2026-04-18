import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, Check, AlertCircle, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
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
import { 
  useOperationalCosts, 
  useCreateOperationalCost, 
  useUpdateOperationalCost, 
  useMarkCostPaid, 
  useDeleteOperationalCost, 
  type OperationalCost, 
  type OperationalCostInput 
} from "@/hooks/useOperationalCosts";
import { CostForm } from "./CostForm";
import { format } from "date-fns";

export function OperationalCostsSection() {
  const { t } = useTranslation();
  const { data: costs, isLoading } = useOperationalCosts();
  const createCost = useCreateOperationalCost();
  const updateCost = useUpdateOperationalCost();
  const markPaid = useMarkCostPaid();
  const deleteCost = useDeleteOperationalCost();
  
  const [costFormOpen, setCostFormOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<OperationalCost | null>(null);
  const [deletingCost, setDeletingCost] = useState<OperationalCost | null>(null);

  const handleCostSubmit = (data: OperationalCostInput) => {
    if (editingCost) {
      updateCost.mutate({ id: editingCost.id, ...data });
    } else {
      createCost.mutate(data);
    }
    setEditingCost(null);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "supplier_payment": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "operational": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300";
      case "marketing": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "staff": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge variant="default" className="bg-green-500"><Check className="w-3 h-3 mr-1" />Paid</Badge>;
      case "overdue":
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Overdue</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const getFrequencyBadge = (frequency: string) => {
    switch (frequency) {
      case "monthly": return <Badge variant="outline">Monthly</Badge>;
      case "annual": return <Badge variant="outline">Annual</Badge>;
      default: return <Badge variant="outline">One-time</Badge>;
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t("admin.products.operationalCosts", "Operational Costs")}</CardTitle>
            <CardDescription>{t("admin.products.operationalCostsDesc", "Track recurring and one-time business expenses")}</CardDescription>
          </div>
          <Button onClick={() => { setEditingCost(null); setCostFormOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            {t("admin.products.addCost", "Add Cost")}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : costs && costs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name", "Name")}</TableHead>
                  <TableHead>{t("common.category", "Category")}</TableHead>
                  <TableHead className="text-right">{t("common.amount", "Amount")}</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>{t("common.status", "Status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costs.map((cost) => (
                  <TableRow key={cost.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{cost.name}</p>
                        {cost.notes && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{cost.notes}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded-full ${getCategoryColor(cost.category)}`}>
                        {cost.category.replace("_", " ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">€{Number(cost.amount).toFixed(2)}</TableCell>
                    <TableCell>{getFrequencyBadge(cost.frequency)}</TableCell>
                    <TableCell>
                      {cost.due_date ? format(new Date(cost.due_date), "dd MMM yyyy") : "-"}
                    </TableCell>
                    <TableCell>{getStatusBadge(cost.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {cost.status !== "paid" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => markPaid.mutate(cost.id)}
                            title="Mark as paid"
                          >
                            <Check className="w-4 h-4 text-green-600" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setEditingCost(cost); setCostFormOpen(true); }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingCost(cost)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No operational costs recorded yet.</p>
              <Button variant="outline" className="mt-4" onClick={() => setCostFormOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add your first expense
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cost Form Dialog */}
      <CostForm
        open={costFormOpen}
        onOpenChange={setCostFormOpen}
        onSubmit={handleCostSubmit}
        cost={editingCost}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingCost} onOpenChange={() => setDeletingCost(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cost Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingCost?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingCost) {
                  deleteCost.mutate(deletingCost.id);
                  setDeletingCost(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
