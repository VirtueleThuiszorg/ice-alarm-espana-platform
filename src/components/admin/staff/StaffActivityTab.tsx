import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStaffActivity } from "@/hooks/useStaffActivityLog";

interface StaffActivityTabProps {
  staffId: string;
}

function getActionBadge(action: string) {
  switch (action) {
    case "status_change":
      return <Badge className="bg-amber-500 text-white">Status Change</Badge>;
    case "role_change":
      return <Badge className="bg-purple-500 text-white">Role Change</Badge>;
    case "profile_update":
      return <Badge variant="secondary">Profile Update</Badge>;
    case "document_upload":
      return <Badge className="bg-blue-500 text-white">Document Upload</Badge>;
    case "document_delete":
      return <Badge variant="destructive">Document Delete</Badge>;
    case "login":
      return <Badge variant="outline">Login</Badge>;
    case "note_added":
      return <Badge variant="secondary">Note Added</Badge>;
    default:
      return <Badge variant="outline">{action}</Badge>;
  }
}

function formatDetails(action: string, details: Record<string, unknown>): string {
  switch (action) {
    case "status_change":
      return `Status changed from "${details.old_status}" to "${details.new_status}"`;
    case "role_change":
      return `Role changed from "${details.old_role}" to "${details.new_role}"`;
    case "profile_update":
      if (Array.isArray(details.updated_fields)) {
        return `Updated: ${details.updated_fields.join(", ")}`;
      }
      return "Profile information updated";
    case "document_upload":
      return `Uploaded ${details.document_type}: ${details.file_name}`;
    case "document_delete":
      return `Deleted ${details.document_type}: ${details.file_name}`;
    case "login":
      return "Logged in";
    case "note_added":
      return String(details.note || "Note added");
    default:
      return JSON.stringify(details);
  }
}

export function StaffActivityTab({ staffId }: StaffActivityTabProps) {
  const { data: activities, isLoading } = useStaffActivity(staffId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity Log</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">Loading activity...</p>
        ) : activities && activities.length > 0 ? (
          <div className="space-y-4">
            {activities.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-4 pb-4 border-b last:border-0 last:pb-0"
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getActionBadge(entry.action)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    {formatDetails(entry.action, entry.details)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      by {entry.performed_by_name || "System"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(entry.created_at), "dd MMM yyyy, HH:mm")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">No activity recorded yet</p>
        )}
      </CardContent>
    </Card>
  );
}
