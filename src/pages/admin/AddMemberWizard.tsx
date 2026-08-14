import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Staff-initiated member creation is NOT IMPLEMENTED. This page says so.
 *
 * What used to be here: a ten-step wizard ending in a "Complete Registration"
 * button and a success screen reading "Member registered successfully". It
 * contained no data access of any kind — no supabase call, no edge-function
 * invoke, no mutation. Its only outward action was navigate("/admin/members").
 *
 * So a staff member could collect a full set of personal and medical details from
 * someone on the phone, walk all ten steps, be told the member was created, and
 * no record would exist anywhere. The details were gone the moment the tab
 * closed. On a life-safety product that is the worst kind of defect: it does not
 * fail, it reports success.
 *
 * This replaces it with the truth. It is deliberately NOT a partial
 * implementation — building the real thing is blocked on the payer-vs-member
 * decision in MEMBER_ONBOARDING.md (Q1), which determines the schema. Shipping
 * half of it before that decision would mean migrating real member records later.
 *
 * The route and the four entry points that reach it (MembersPage, AdminDashboard,
 * GlobalSearch, LeadsPage's lead conversion) are intentionally left in place. A
 * visible, honest "not available" is better than a silently removed button: staff
 * discover the gap immediately instead of hunting for a feature that was never
 * there, and the missing capability stays visible to whoever plans the work.
 *
 * See MEMBER_ONBOARDING.md — this is its phase 0.
 */
export default function AddMemberWizard() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Button variant="ghost" onClick={() => navigate("/admin/members")} className="mb-4 gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back to Members
      </Button>

      <Card className="border-destructive/40">
        <CardHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
          </div>
          <CardTitle className="text-center text-2xl">
            Adding a member here is not available yet
          </CardTitle>
          <CardDescription className="text-center text-base">
            Please do not collect details on this screen — there is nowhere for them to go.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 text-base">
          <p>
            This page previously walked through ten steps and reported that the member had
            been created. It never created anything, and the details entered were not saved.
            It has been replaced with this notice so nobody relies on it again.
          </p>

          <div className="rounded-md border bg-muted/40 p-4">
            <p className="font-medium">What to do instead, for now:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                Take the person&apos;s details by your usual offline route and hold them
                until staff-initiated onboarding ships.
              </li>
              <li>
                If they can sign up themselves, send them to the public join flow — that
                path does create a real record and take payment.
              </li>
              <li>
                For someone who is already a member, use{" "}
                <Link
                  to="/admin/members"
                  className="inline-block py-1 font-medium text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                >
                  Members
                </Link>{" "}
                and the &quot;request updated records&quot; action on their record, which
                does work.
              </li>
            </ul>
          </div>

          <p className="text-muted-foreground">
            The design for staff-initiated onboarding is written up in
            <span className="font-mono text-sm"> MEMBER_ONBOARDING.md</span>. Building it is
            waiting on one decision: whether the person who pays is the same person who is
            monitored.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
