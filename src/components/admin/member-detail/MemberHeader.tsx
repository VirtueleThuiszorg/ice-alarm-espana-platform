import { Edit, MoreHorizontal, Phone, Mail, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MemberHeaderProps {
  member: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    photo_url?: string | null;
    address_line_1: string;
    city: string;
    province: string | null;
    status: string;
  };
  subscription?: {
    plan_type: string;
    status: string;
  } | null;
  hasDevice: boolean;
  onEdit: () => void;
  onSuspend: () => void;
  onDelete: () => void;
}

export function MemberHeader({ 
  member, 
  subscription, 
  hasDevice, 
  onEdit, 
  onSuspend, 
  onDelete 
}: MemberHeaderProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-alert-resolved text-alert-resolved-foreground">Active</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      case "suspended":
        return <Badge variant="destructive">Suspended</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const initials = `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();

  return (
    <div className="space-y-4">
      {/* Member Info Card */}
      <div className="flex flex-col md:flex-row md:items-start gap-4 p-4 bg-card rounded-lg border">
        {/* Photo */}
        <Avatar className="h-24 w-24">
          <AvatarImage src={member.photo_url ?? undefined} alt={`${member.first_name} ${member.last_name}`} />
          <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
        </Avatar>

        {/* Details */}
        <div className="flex-1 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{member.first_name} {member.last_name}</h1>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {member.email}
                </span>
                <span className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  {member.phone}
                </span>
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                <MapPin className="h-4 w-4" />
                {member.address_line_1}, {member.city}, {member.province}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onEdit}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onSuspend}>
                    {member.status === "suspended" ? "Reactivate Member" : "Suspend Member"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                    Delete Member
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2 pt-2">
            {getStatusBadge(member.status)}
            {subscription && subscription.status === "active" && (
              <Badge variant="secondary" className="capitalize">
                {subscription.plan_type} Plan
              </Badge>
            )}
            {hasDevice ? (
              <Badge variant="outline" className="bg-alert-resolved/10 text-alert-resolved border-alert-resolved/20">
                Has Pendant
              </Badge>
            ) : (
              <Badge variant="outline">No Device</Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
