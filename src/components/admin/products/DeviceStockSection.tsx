import { useState } from "react";
import {
  Smartphone, Plus, Wifi, WifiOff, Package,
  User, AlertTriangle, Truck, CheckCircle2, Upload
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeviceStock, useDeviceStockStats, type DeviceStatusFilter } from "@/hooks/useDeviceStock";
import { AddDeviceModal } from "./AddDeviceModal";
import { BulkImeiImportModal } from "./BulkImeiImportModal";
import { formatDistanceToNow } from "date-fns";

export function DeviceStockSection() {
  const [statusFilter, setStatusFilter] = useState<DeviceStatusFilter>("all");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  
  const { data: devices, isLoading } = useDeviceStock(statusFilter);
  const { data: stats } = useDeviceStockStats();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "in_stock":
        return (
          <Badge variant="secondary" className="gap-1">
            <Package className="w-3 h-3" />
            In Stock
          </Badge>
        );
      case "reserved":
        return (
          <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-700">
            Reserved
          </Badge>
        );
      case "allocated":
        return (
          <Badge variant="outline" className="gap-1 border-blue-500 text-blue-700">
            <User className="w-3 h-3" />
            Allocated
          </Badge>
        );
      case "with_staff":
        return (
          <Badge variant="outline" className="gap-1 border-purple-500 text-purple-700">
            <Truck className="w-3 h-3" />
            With Staff
          </Badge>
        );
      case "live":
        return (
          <Badge variant="default" className="gap-1 bg-green-500">
            <CheckCircle2 className="w-3 h-3" />
            Live
          </Badge>
        );
      case "faulty":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="w-3 h-3" />
            Faulty
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            EV-07B Stock Management
          </CardTitle>
          <CardDescription>
            Manage your EV-07B pendant inventory and track device lifecycle
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setBulkImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Bulk Import
          </Button>
          <Button onClick={() => setAddModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Device
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Summary */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2 p-4 bg-muted/50 rounded-lg">
            <div className="text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-600">{stats.in_stock}</p>
              <p className="text-xs text-muted-foreground">In Stock</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600">{stats.reserved}</p>
              <p className="text-xs text-muted-foreground">Reserved</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.allocated}</p>
              <p className="text-xs text-muted-foreground">Allocated</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600">{stats.with_staff}</p>
              <p className="text-xs text-muted-foreground">With Staff</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{stats.live}</p>
              <p className="text-xs text-muted-foreground">Live</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{stats.faulty}</p>
              <p className="text-xs text-muted-foreground">Faulty</p>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter by status:</span>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as DeviceStatusFilter)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Devices</SelectItem>
              <SelectItem value="in_stock">In Stock</SelectItem>
              <SelectItem value="reserved">Reserved</SelectItem>
              <SelectItem value="allocated">Allocated</SelectItem>
              <SelectItem value="with_staff">With Staff</SelectItem>
              <SelectItem value="live">Live</SelectItem>
              <SelectItem value="faulty">Faulty</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Device Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : devices && devices.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IMEI / Serial</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Online</TableHead>
                <TableHead>Last Check-in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell>
                    <div>
                      <p className="font-mono text-sm">{device.imei}</p>
                      {device.serial_number && (
                        <p className="text-xs text-muted-foreground">
                          S/N: {device.serial_number}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(device.status)}</TableCell>
                  <TableCell>
                    {device.member ? (
                      <div>
                        <p className="text-sm font-medium">
                          {device.member.first_name} {device.member.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {device.member.email}
                        </p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {device.is_online ? (
                      <Badge variant="outline" className="gap-1 border-green-500 text-green-700">
                        <Wifi className="w-3 h-3" />
                        Online
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 border-gray-400 text-gray-500">
                        <WifiOff className="w-3 h-3" />
                        Offline
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {device.last_checkin_at ? (
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(device.last_checkin_at), { addSuffix: true })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Never</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Smartphone className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No devices found</p>
            <Button variant="outline" className="mt-4" onClick={() => setAddModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add your first device
            </Button>
          </div>
        )}
      </CardContent>

      <AddDeviceModal open={addModalOpen} onOpenChange={setAddModalOpen} />
      <BulkImeiImportModal open={bulkImportOpen} onOpenChange={setBulkImportOpen} />
    </Card>
  );
}
