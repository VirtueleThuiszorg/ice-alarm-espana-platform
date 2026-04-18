import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { 
  UserPlus, 
  ArrowRight, 
  Mail, 
  Phone,
  Clock
} from "lucide-react";

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  enquiry_type: string;
  created_at: string;
}

interface LeadsWidgetProps {
  variant?: 'admin' | 'staff';
}

export function LeadsWidget({ variant = 'admin' }: LeadsWidgetProps) {
  const { t } = useTranslation();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeads();

    const channel = supabase
      .channel('leads-widget')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchLeads();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchLeads = async () => {
    const { data, count } = await supabase
      .from('leads')
      .select('id, first_name, last_name, email, phone, enquiry_type, created_at', { count: 'exact' })
      .eq('status', 'new')
      .order('created_at', { ascending: false })
      .limit(5);

    setLeads(data || []);
    setNewCount(count || 0);
    setLoading(false);
  };

  const getEnquiryLabel = (type: string) => {
    const labels: Record<string, string> = {
      general: t('leadsWidget.general'),
      pricing: t('leadsWidget.pricing'),
      demo: t('leadsWidget.demo'),
      partnership: t('leadsWidget.partnership'),
      support: t('leadsWidget.support')
    };
    return labels[type] || type;
  };

  const linkPath = variant === 'admin' ? '/admin/leads' : '/call-centre/leads';

  return (
    <Card className={newCount > 0 ? "border-blue-500/50 bg-blue-500/5" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserPlus className={`h-5 w-5 ${newCount > 0 ? 'text-blue-500' : 'text-muted-foreground'}`} />
            {t('leadsWidget.newLeads')}
            {newCount > 0 && (
              <Badge className="bg-blue-500 text-white ml-2">{newCount}</Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to={linkPath}>
              {t('leadsWidget.viewAll')} <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="text-center py-4 text-muted-foreground text-sm">{t('common.loading')}</div>
        ) : leads.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">{t('leadsWidget.noNewLeads')}</p>
          </div>
        ) : (
          leads.map((lead) => (
            <Link
              key={lead.id}
              to={linkPath}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">
                    {lead.first_name} {lead.last_name}
                  </p>
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {getEnquiryLabel(lead.enquiry_type)}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {lead.email}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(lead.created_at), 'HH:mm')}
                  </span>
                </div>
              </div>
              <div className="ml-2 flex gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.href = `tel:${lead.phone}`;
                  }}
                >
                  <Phone className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.href = `mailto:${lead.email}`;
                  }}
                >
                  <Mail className="h-4 w-4" />
                </Button>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
