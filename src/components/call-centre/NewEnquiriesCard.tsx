import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, ArrowRight, Mail, Inbox } from "lucide-react";

/**
 * NEW ENQUIRIES AWAITING A FIRST REPLY.
 *
 * Lee sent a message from the public Contact page and found nothing in
 * Communications, Messages or notifications. It was in `leads` the whole time,
 * and the only thing that would ever have shown it was a Leads screen somebody
 * happened to open. This is the other half of that fix: the held bundle raises
 * a bell notification per active staff member, and this puts unworked enquiries
 * on the screen operators already have in front of them.
 *
 * WHY `status = 'new'` IS THE RIGHT FILTER: both Leads screens move a lead off
 * `new` as soon as anyone touches it, so "new" is exactly "nobody has picked
 * this up yet". A count of all leads would be a vanity number; this is a
 * worklist, and it empties.
 *
 * The realtime subscription is a refresh, not the notification. `leads` is in
 * the supabase_realtime publication, so this list stays current for an operator
 * watching it — but a live list is not the same as being told, which is the
 * distinction the whole wiring register turns on.
 */

interface NewEnquiry {
  id: string;
  first_name: string;
  last_name: string;
  enquiry_type: string | null;
  preferred_language: string | null;
  source: string | null;
  created_at: string;
}

const QUERY_KEY = ["call-centre", "new-enquiries"];

export function NewEnquiriesCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: enquiries, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<NewEnquiry[]> => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, first_name, last_name, enquiry_type, preferred_language, source, created_at")
        .eq("status", "new")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as NewEnquiry[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("call-centre-new-enquiries")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const waiting = enquiries?.length ?? 0;

  return (
    <Card className={waiting > 0 ? "shadow-sm border-amber-500/40" : "shadow-sm"}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            {t("staffDashboard.newEnquiries", "New enquiries")}
            {waiting > 0 && (
              <Badge variant="secondary" className="text-xs">
                {waiting}
              </Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
            <Link to="/call-centre/leads">
              {t("staffDashboard.viewAll", "View all")} <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {isLoading ? (
          <>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </>
        ) : waiting === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle className="h-6 w-6 mx-auto mb-1.5 text-emerald-500" />
            <p className="text-sm">
              {t("staffDashboard.noNewEnquiries", "Every enquiry has been picked up")}
            </p>
          </div>
        ) : (
          enquiries?.map((lead) => {
            const name = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim();
            return (
              <Link
                key={lead.id}
                to="/call-centre/leads"
                className="flex items-center justify-between p-2.5 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {/* A lead can arrive with blank names — the columns are NOT
                          NULL but empty strings get through — and "  " reads as a
                          broken row rather than an anonymous one. */}
                      {name || t("staffDashboard.enquiryNoName", "No name given")}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {lead.enquiry_type ?? "general"}
                      {lead.preferred_language && lead.preferred_language !== "en"
                        ? ` · ${lead.preferred_language}`
                        : ""}
                      {" · "}
                      {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
