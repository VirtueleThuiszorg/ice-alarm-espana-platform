import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MoreHorizontal, ListTodo, Eye, MessageCircle, Loader2, CreditCard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface PaidSale {
  id: string;
  amount: number;
  paid_at: string;
  order_id: string | null;
  member: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    preferred_language: string;
  } | null;
  order: {
    id: string;
    order_number: string;
  } | null;
  products_summary?: string;
  attribution?: {
    partner_id: string;
    partner_name: string;
  } | null;
}

export function PaidSalesFeed() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sendingWhatsApp, setSendingWhatsApp] = useState<string | null>(null);

  const { data: paidSales, isLoading } = useQuery({
    queryKey: ["paid-sales-feed"],
    queryFn: async () => {
      // Get last 20 completed payments with member and order info
      const { data: payments, error } = await supabase
        .from("payments")
        .select(`
          id,
          amount,
          paid_at,
          order_id,
          member_id,
          members!inner (
            id,
            first_name,
            last_name,
            email,
            preferred_language
          )
        `)
        .eq("status", "completed")
        .not("paid_at", "is", null)
        .order("paid_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      // Get order info and attributions for each payment
      const enrichedSales: PaidSale[] = [];
      
      for (const payment of payments || []) {
        let orderInfo = null;
        let attribution = null;
        let productsSummary = "";

        if (payment.order_id) {
          const { data: order } = await supabase
            .from("orders")
            .select("id, order_number")
            .eq("id", payment.order_id)
            .single();
          orderInfo = order;

          // Get order items
          const { data: items } = await supabase
            .from("order_items")
            .select("description, quantity")
            .eq("order_id", payment.order_id);
          
          productsSummary = items?.map(i => `${i.quantity}x ${i.description}`).join(", ") || "";
        }

        // Check for partner attribution
        const memberId = (payment.members as any)?.id;
        if (memberId) {
          const { data: attr } = await supabase
            .from("partner_attributions")
            .select("partner_id, partners(contact_name, company_name)")
            .eq("member_id", memberId)
            .maybeSingle();

          if (attr) {
            const partner = attr.partners as any;
            attribution = {
              partner_id: attr.partner_id,
              partner_name: partner?.contact_name || partner?.company_name || "Partner",
            };
          }
        }

        enrichedSales.push({
          id: payment.id,
          amount: payment.amount,
          paid_at: payment.paid_at!,
          order_id: payment.order_id,
          member: payment.members as any,
          order: orderInfo,
          products_summary: productsSummary,
          attribution,
        });
      }

      return enrichedSales;
    },
    refetchInterval: 30000,
  });

  const sendWhatsAppMutation = useMutation({
    mutationFn: async (sale: PaidSale) => {
      const { data, error } = await supabase.functions.invoke("notify-admin", {
        body: {
          event_type: "sale.paid",
          entity_type: "order",
          entity_id: sale.order_id,
          payload: {
            customer_name: `${sale.member?.first_name} ${sale.member?.last_name}`,
            language: sale.member?.preferred_language || "ES",
            amount: sale.amount,
            products_summary: sale.products_summary || "N/A",
            source: sale.attribution ? "partner" : "direct",
            partner_name: sale.attribution?.partner_name,
            order_id: sale.order_id,
          },
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("WhatsApp notification sent");
      queryClient.invalidateQueries({ queryKey: ["notification-log"] });
    },
    onError: (error) => {
      toast.error(`Failed to send: ${error.message}`);
    },
  });

  const handleSendWhatsApp = async (sale: PaidSale) => {
    setSendingWhatsApp(sale.id);
    await sendWhatsAppMutation.mutateAsync(sale);
    setSendingWhatsApp(null);
  };

  const handleCreateFollowUp = (sale: PaidSale) => {
    // Navigate to tickets with pre-filled data
    navigate(`/admin/tickets?action=create&member_id=${sale.member?.id}&title=Follow-up: ${sale.member?.first_name} ${sale.member?.last_name}`);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Recent Paid Sales
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Recent Paid Sales
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Lang</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paidSales?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No paid sales yet
                  </TableCell>
                </TableRow>
              ) : (
                paidSales?.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(sale.paid_at), "HH:mm")}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {sale.member?.first_name} {sale.member?.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">{sale.member?.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase">
                        {sale.member?.preferred_language || "ES"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate text-sm">
                      {sale.products_summary || "—"}
                    </TableCell>
                    <TableCell className="font-bold text-green-600">
                      €{sale.amount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {sale.attribution ? (
                        <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                          {sale.attribution.partner_name}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Direct</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleCreateFollowUp(sale)}>
                            <ListTodo className="mr-2 h-4 w-4" />
                            Create Follow-up
                          </DropdownMenuItem>
                          {sale.order_id && (
                            <DropdownMenuItem onClick={() => navigate(`/admin/orders?highlight=${sale.order_id}`)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Order
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            onClick={() => handleSendWhatsApp(sale)}
                            disabled={sendingWhatsApp === sale.id}
                          >
                            {sendingWhatsApp === sale.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <MessageCircle className="mr-2 h-4 w-4" />
                            )}
                            Send WhatsApp Now
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
