import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Loader2, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Read-only order detail page. Fixes the dead /admin/orders/:id navigation from
 * OrdersPage (the list linked to a route that did not exist). No mutations here —
 * order actions remain on the list page.
 */
export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: order, isLoading, error } = useQuery({
    queryKey: ["admin-order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `*, order_items(*), member:member_id (id, first_name, last_name, email, phone)`,
        )
        .eq("id", id as string)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" onClick={() => navigate("/admin/orders")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to orders
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Order not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  const money = (n: unknown) => `€${Number(n ?? 0).toFixed(2)}`;

  return (
    <div className="p-6 space-y-6">
      <Button variant="ghost" onClick={() => navigate("/admin/orders")}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to orders
      </Button>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Package className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-semibold font-mono">{order.order_number}</h1>
          <Badge>{order.status}</Badge>
        </div>
        <span className="text-sm text-muted-foreground">
          {order.created_at ? format(new Date(order.created_at), "dd MMM yyyy HH:mm") : ""}
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Member</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {order.member ? (
              <>
                <p className="font-medium">
                  {order.member.first_name} {order.member.last_name}
                </p>
                <p className="text-muted-foreground">{order.member.email}</p>
                <p className="text-muted-foreground">{order.member.phone || "—"}</p>
              </>
            ) : (
              <p className="text-muted-foreground">Unknown member</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Shipping</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{order.shipping_address_line_1}</p>
            {order.shipping_address_line_2 && <p>{order.shipping_address_line_2}</p>}
            <p>
              {order.shipping_postal_code} {order.shipping_city}, {order.shipping_province}
            </p>
            <p>{order.shipping_country}</p>
            <p className="text-muted-foreground pt-2">
              Tracking: {order.tracking_number || "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Items</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(order.order_items ?? []).length > 0 ? (
                order.order_items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{money(item.unit_price)}</TableCell>
                    <TableCell className="text-right">{money(item.tax_amount)}</TableCell>
                    <TableCell className="text-right">{money(item.total_price)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No line items.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="mt-4 space-y-1 text-sm max-w-xs ml-auto">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span><span>{money(order.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span><span>{money(order.tax_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span><span>{money(order.shipping_amount)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-1">
              <span>Total</span><span>{money(order.total_amount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {order.notes && (
        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{order.notes}</CardContent>
        </Card>
      )}
    </div>
  );
}
