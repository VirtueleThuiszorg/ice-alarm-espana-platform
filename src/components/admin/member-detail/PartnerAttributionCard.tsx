import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";

interface PartnerAttributionCardProps {
  memberId: string;
}

export function PartnerAttributionCard({ memberId }: PartnerAttributionCardProps) {
  const { data: attribution, isLoading } = useQuery({
    queryKey: ["member-attribution", memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_attributions")
        .select(`
          id,
          source,
          ref_param,
          first_touch_at,
          partner_id,
          partners (
            id,
            contact_name,
            company_name,
            email,
            referral_code
          )
        `)
        .eq("member_id", memberId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!memberId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Partner Attribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-16 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!attribution) {
    return null; // Don't show card if no attribution
  }

  const partner = attribution.partners as any;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Referred by Partner
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">
              {partner?.company_name || partner?.contact_name}
            </p>
            <p className="text-sm text-muted-foreground">{partner?.email}</p>
          </div>
          <Link
            to={`/admin/partners/${partner?.id}`}
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            View Partner
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="capitalize">
            {attribution.source.replace("_", " ")}
          </Badge>
          {attribution.ref_param && (
            <Badge variant="secondary">
              Code: {attribution.ref_param}
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          First touch: {format(new Date(attribution.first_touch_at), "dd MMM yyyy HH:mm")}
        </p>
      </CardContent>
    </Card>
  );
}
