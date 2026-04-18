import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Search,
  Plus,
  MoreHorizontal,
  Eye,
  Battery,
  MapPin,
  Smartphone,
  Settings,
  ChevronLeft,
  ChevronRight,
  Wifi,
  WifiOff,
  Package,
  Users,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { format } from "date-fns";
import { useDeviceRealtime } from "@/hooks/useDeviceRealtime";
import { useAlertsRealtime } from "@/hooks/useAlertsRealtime";
import { useDeviceStockStats } from "@/hooks/useDeviceStock";
import { AddDeviceModal } from "@/components/admin/products/AddDeviceModal";

const ITEMS_PER_PAGE = 20;

export default function DevicesPage() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assignmentFilter, setAssignmentFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState<any>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Subscribe to realtime updates
  useDeviceRealtime();
  useAlertsRealtime();

  const deleteDeviceMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      const { error } = await supabase.from("devices").delete().eq("id", deviceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-devices"] });
      toast.success(t("admin.devices.deleteSuccess", "Device deleted successfully"));
      setDeviceToDelete(null);
    },
    onError: () => {
      toast.error(t("admin.devices.deleteError", "Failed to delete device. It may be assigned to a member."));
      setDeviceToDelete(null);
    },
  });
  const { data: stockStats } = useDeviceStockStats();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-devices", searchQuery, statusFilter, assignmentFilter, page],
    queryFn: async () => {
      let query = supabase
        .from("devices")
        .select(`
          *,
          member:member_id (id, first_name, last_name, email)
        `, { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1);

      if (searchQuery) {
        query = query.or(`imei.ilike.%${searchQuery}%,sim_phone_number.ilike.%${searchQuery}%`);
      }

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "active" | "inactive" | "faulty" | "returned" | "in_stock");
      }

      if (assignmentFilter === "assigned") {
        query = query.not("member_id", "is", null);
      } else if (assignmentFilter === "unassigned") {
        query = query.is("member_id", null);
      }

      const { data: devices, count, error } = await query;
      if (error) throw error;

      return { devices: devices || [], totalCount: count || 0 };
    },
  });

  const totalPages = Math.ceil((data?.totalCount || 0) / ITEMS_PER_PAGE);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "in_stock":
        return <Badge variant="outline">{t("admin.devices.statuses.in_stock")}</Badge>;
      case "reserved":
        return <Badge variant="secondary">{t("admin.devices.statuses.reserved")}</Badge>;
      case "allocated":
        return <Badge className="bg-blue-500 text-white">{t("admin.devices.statuses.allocated")}</Badge>;
      case "with_staff":
        return <Badge className="bg-amber-500 text-white">{t("admin.devices.statuses.with_staff")}</Badge>;
      case "live":
        return <Badge className="bg-alert-resolved text-alert-resolved-foreground">{t("admin.devices.statuses.live")}</Badge>;
      case "faulty":
        return <Badge variant="destructive">{t("admin.devices.statuses.faulty")}</Badge>;
      case "returned":
        return <Badge variant="secondary">{t("admin.devices.statuses.returned")}</Badge>;
      case "inactive":
        return <Badge variant="secondary">{t("admin.devices.statuses.inactive")}</Badge>;
      case "active":
        return <Badge className="bg-alert-resolved text-alert-resolved-foreground">{t("admin.devices.statuses.active_legacy")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getBatteryIndicator = (level: number | null) => {
    if (level === null) return <span className="text-muted-foreground">{t("admin.devices.na")}</span>;
    
    let color = "text-alert-resolved";
    if (level < 20) color = "text-alert-sos";
    else if (level < 50) color = "text-amber-500";

    return (
      <div className="flex items-center gap-1">
        <Battery className={`h-4 w-4 ${color}`} />
        <span className={color}>{level}%</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("admin.devices.title")}</h1>
          <p className="text-muted-foreground">
            {t("admin.devices.subtitle")}
          </p>
        </div>
        <Button onClick={() => setAddModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("admin.devices.addDevice")}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
                <Package className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stockStats?.in_stock ?? 0}</p>
                <p className="text-sm text-muted-foreground">{t("admin.devices.stats.inStock")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stockStats?.allocated ?? 0}</p>
                <p className="text-sm text-muted-foreground">{t("admin.devices.stats.allocated")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Wifi className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stockStats?.live ?? 0}</p>
                <p className="text-sm text-muted-foreground">{t("admin.devices.stats.live")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stockStats?.total ?? 0}</p>
                <p className="text-sm text-muted-foreground">{t("admin.devices.totalDevices")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("admin.devices.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t("common.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")} {t("common.status")}</SelectItem>
                <SelectItem value="in_stock">{t("admin.devices.statuses.in_stock")}</SelectItem>
                <SelectItem value="reserved">{t("admin.devices.statuses.reserved")}</SelectItem>
                <SelectItem value="allocated">{t("admin.devices.statuses.allocated")}</SelectItem>
                <SelectItem value="with_staff">{t("admin.devices.statuses.with_staff")}</SelectItem>
                <SelectItem value="live">{t("admin.devices.statuses.live")}</SelectItem>
                <SelectItem value="faulty">{t("admin.devices.statuses.faulty")}</SelectItem>
                <SelectItem value="returned">{t("admin.devices.statuses.returned")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={assignmentFilter} onValueChange={(v) => { setAssignmentFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t("admin.table.assignment")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                <SelectItem value="assigned">{t("admin.members.assigned")}</SelectItem>
                <SelectItem value="unassigned">{t("admin.devices.unassigned")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Devices Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.table.imei")}</TableHead>
                <TableHead>{t("admin.table.simNumber")}</TableHead>
                <TableHead>{t("admin.table.member")}</TableHead>
                <TableHead>{t("admin.table.status")}</TableHead>
                <TableHead>{t("common.online")}</TableHead>
                <TableHead>{t("admin.table.battery")}</TableHead>
                <TableHead>{t("admin.table.lastCheckIn")}</TableHead>
                <TableHead className="w-[70px]">{t("admin.table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    {t("admin.devices.loading")}
                  </TableCell>
                </TableRow>
              ) : data?.devices && data.devices.length > 0 ? (
                data.devices.map((device: any) => (
                  <TableRow 
                    key={device.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/admin/devices/${device.id}`)}
                  >
                    <TableCell className="font-mono">{device.imei}</TableCell>
                    <TableCell>{device.sim_phone_number}</TableCell>
                    <TableCell>
                      {device.member ? (
                        <Link 
                          to={`/admin/members/${device.member.id}`}
                          className="text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {device.member.first_name} {device.member.last_name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{t("admin.devices.unassigned")}</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(device.status)}</TableCell>
                    <TableCell>
                      {device.is_online ? (
                        <Badge className="bg-green-500 text-white gap-1">
                          <Wifi className="h-3 w-3" />
                          {t("admin.devices.online")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <WifiOff className="h-3 w-3" />
                          {t("admin.devices.offline")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{getBatteryIndicator(device.battery_level)}</TableCell>
                    <TableCell>
                      {device.last_checkin_at ? (
                        format(new Date(device.last_checkin_at), "dd MMM, HH:mm")
                      ) : (
                        <span className="text-muted-foreground">{t("admin.devices.never")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/admin/devices/${device.id}`);
                          }}>
                            <Eye className="mr-2 h-4 w-4" />
                            {t("admin.devices.viewDetails")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/admin/devices/${device.id}`);
                          }}>
                            <Settings className="mr-2 h-4 w-4" />
                            {t("admin.devices.configure")}
                          </DropdownMenuItem>
                          {device.last_location_lat && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              window.open(`https://www.google.com/maps?q=${device.last_location_lat},${device.last_location_lng}`, "_blank");
                            }}>
                              <MapPin className="mr-2 h-4 w-4" />
                              {t("admin.devices.viewLocation")}
                            </DropdownMenuItem>
                          )}
                          {!device.member_id && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeviceToDelete(device);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t("admin.devices.delete", "Delete Device")}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {t("admin.devices.noResults")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("admin.devices.showing", { from: ((page - 1) * ITEMS_PER_PAGE) + 1, to: Math.min(page * ITEMS_PER_PAGE, data?.totalCount || 0), total: data?.totalCount || 0 })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              {t("admin.members.previous")}
            </Button>
            <span className="text-sm">
              {t("admin.members.pageOf", { page, totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              {t("admin.members.next")}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <AddDeviceModal open={addModalOpen} onOpenChange={setAddModalOpen} />

      {/* Delete Device Dialog */}
      <AlertDialog open={!!deviceToDelete} onOpenChange={(open) => !open && setDeviceToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.devices.confirmDelete", "Delete Device?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.devices.deleteWarning", "This will permanently delete this device record (IMEI: {{imei}}). This action cannot be undone.", {
                imei: deviceToDelete?.imei || "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deviceToDelete && deleteDeviceMutation.mutate(deviceToDelete.id)}
            >
              {t("admin.devices.delete", "Delete Device")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}