import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, Clock, Users, Handshake, Brain, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";

interface SalesStats {
  paid_sales_today: number;
  paid_amount_today: number;
  paid_sales_60min: number;
  paid_amount_60min: number;
  new_subscriptions: number;
  partner_signups: number;
  ai_hot_items: number;
  followups_pending: number;
}

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number;
  amount?: number;
  highlight?: boolean;
}

function StatCard({ icon: Icon, label, value, amount, highlight }: StatCardProps) {
  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg bg-background/50 border",
      highlight && value > 0 && "border-green-500/50 bg-green-500/5"
    )}>
      <div className={cn(
        "p-2 rounded-full",
        highlight && value > 0 ? "bg-green-500/10 text-green-600" : "bg-primary/10 text-primary"
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold">{value}</span>
          {amount !== undefined && (
            <span className="text-sm text-muted-foreground">
              (€{amount.toFixed(0)})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function SalesCommandStrip() {
  const { data: stats } = useQuery({
    queryKey: ["sales-command-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sales_command_stats");
      if (error) throw error;
      return data as unknown as SalesStats;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 10000,
  });

  const defaultStats: SalesStats = {
    paid_sales_today: 0,
    paid_amount_today: 0,
    paid_sales_60min: 0,
    paid_amount_60min: 0,
    new_subscriptions: 0,
    partner_signups: 0,
    ai_hot_items: 0,
    followups_pending: 0,
  };

  const s = stats || defaultStats;

  return (
    <div className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-6 bg-gradient-to-r from-primary/5 via-background to-green-500/5 p-4 rounded-lg border">
      <StatCard 
        icon={CreditCard} 
        label="Paid Today" 
        value={s.paid_sales_today} 
        amount={s.paid_amount_today}
        highlight
      />
      <StatCard 
        icon={Clock} 
        label="Last 60min" 
        value={s.paid_sales_60min} 
        amount={s.paid_amount_60min}
        highlight
      />
      <StatCard 
        icon={Users} 
        label="New Subs" 
        value={s.new_subscriptions} 
      />
      <StatCard 
        icon={Handshake} 
        label="Partner Signups" 
        value={s.partner_signups} 
      />
      <StatCard 
        icon={Brain} 
        label="AI Hot Items" 
        value={s.ai_hot_items} 
      />
      <StatCard 
        icon={ListTodo} 
        label="Follow-ups" 
        value={s.followups_pending} 
      />
    </div>
  );
}
