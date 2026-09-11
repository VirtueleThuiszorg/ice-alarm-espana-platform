import { Edit, MoreHorizontal, Phone, Mail, MapPin, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { memberStatusPresentation } from "@/lib/statusLabel";
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
import { MemberOverviewDialog } from "@/components/admin/member-detail/MemberOverviewDialog";
import { useMemberAvatarUrl } from "@/hooks/useMemberAvatar";
import { MemberMissingInfoDialog } from "@/components/admin/member-detail/MemberMissingInfoDialog";

interface MemberHeaderProps {
  member: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    photo_url?: string | null;
    address_line_1: string;
    address_line_2: string | null;
    city: string;
    province: string | null;
    status: string;
    nie_dni: string | null;
    preferred_language: string | null;
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
  const { t } = useTranslation();

  /*
    THE STATUS CHIP. This was a switch with

        default: return <Badge variant="outline">{status}</Badge>;

    and `pending_review` — the status the CRM import writes, so all 431 imported members carry
    it — fell straight through to it. Their chips read `pending_review`, a database value shown
    to staff. `statusLabel.ts` has no default and is keyed on the enum, so the build fails
    rather than the screen degrading if a status is ever added.

    `suspended` also stopped being red. It was `variant="destructive"`, and a suspended member
    is a business state — an operator who sees red on a member record should be looking at an
    emergency (MEMBER_UX_RULES R1).
  */
  const status = memberStatusPresentation(member.status);

  const initials = `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();
  const { data: avatarUrl } = useMemberAvatarUrl(member.id, member.photo_url);

  return (
    <div className="space-y-4">
      {/* Member Info Card */}
      <div
        data-testid="member-header"
        className="flex flex-col gap-4 rounded-lg border bg-card p-4 md:flex-row md:items-start"
      >
        {/*
          THE MEMBER'S PHOTOGRAPH, SIGNED.

          `photo_url` was passed straight to `<AvatarImage src>`, which worked for the absolute
          URLs the old CRM import wrote and shows NOTHING for a photo a member uploaded
          themselves: the `member-avatars` bucket is private (20260910150000), so the column
          holds an object PATH and the only URL that renders it is a short-lived signed one.
          Staff have a read policy over the whole bucket, so signing here is theirs to do.

          `useMemberAvatarUrl` passes an absolute URL through untouched, so an imported photo
          keeps working — the column legitimately holds two shapes and `avatarUrlIsPath` is
          what tells them apart.
        */}
        <Avatar className="h-24 w-24">
          <AvatarImage
            src={avatarUrl ?? undefined}
            alt={`${member.first_name} ${member.last_name}`}
          />
          {/*
            BRAND-TINTED INITIALS. The default fallback is the same grey as everything else, so
            a member with no photograph had a grey disc where their face goes — the emptiest
            part of the emptiest version of this page.

            NOT `bg-accent`, which is what this obviously wants and what the first version used:
            on .theme-staff and .theme-admin --accent is a warm SAND with near-black ink, so the
            disc came out beige on both of the surfaces this actually renders on. Own tokens,
            unshadowed by either theme, 8.15:1.
          */}
          <AvatarFallback className="bg-[hsl(var(--member-avatar))] text-2xl font-semibold text-[hsl(var(--member-avatar-foreground))]">
            {initials}
          </AvatarFallback>
        </Avatar>

        {/* Details */}
        <div className="flex-1 space-y-2">
          {/*
            WRAP, and this is a fix rather than a tidy-up. This row was `flex items-start
            justify-between` with a four-button action group that could not wrap, so at 390px
            the buttons pushed the whole document 325px wide and the member record scrolled
            sideways on a phone. Found by photographing it at 390 while doing the tabs.
          */}
          <div className="flex flex-col items-start justify-between gap-3 lg:flex-row">
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
            <div className="flex flex-wrap items-center gap-2">
              {/*
                Overview before Edit: the commonest thing somebody does on this page is read it,
                and until now reading it meant clicking through twelve tabs.
              */}
              <MemberOverviewDialog
                memberId={member.id}
                memberName={`${member.first_name} ${member.last_name}`}
              />
              {/*
                The count next to it, always visible. Eleven gaps and none of them look like
                anything from the outside — every tab renders either way.
              */}
              <MemberMissingInfoDialog member={member} />
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
            <Badge data-testid="member-status-chip" className={cn(status.className, "font-medium")}>
              {t(status.key, status.fallback)}
            </Badge>
            {subscription && subscription.status === "active" && (
              <Badge variant="secondary" className="capitalize">
                {subscription.plan_type} Plan
              </Badge>
            )}
            {/*
              NEUTRAL, WITH AN ICON. "Has Pendant" was green — the same green as an active
              membership, on a different kind of fact — which made two unrelated chips look like
              one status. Whether a pendant is on file is inventory, not health, so it is grey
              and the icon carries the meaning. The icon is ShieldCheck, the one
              PendantFulfilmentCard already uses for the same device.
            */}
            <Badge
              data-testid="member-pendant-chip"
              variant="outline"
              className="gap-1 font-medium text-slate-700"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {hasDevice
                ? t("memberStatus.hasPendant", "Has pendant")
                : t("memberStatus.noPendant", "No pendant")}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
