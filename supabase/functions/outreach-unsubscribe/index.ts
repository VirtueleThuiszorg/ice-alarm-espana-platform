import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response("<html><body><h1>Invalid link</h1><p>No unsubscribe token provided.</p></body></html>", {
        status: 400,
        headers: { "Content-Type": "text/html" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Look up lead by unsubscribe token in both tables
    let email: string | null = null;

    const { data: crmLead } = await supabase
      .from("outreach_crm_leads")
      .select("id, email, company_name")
      .eq("unsubscribe_token", token)
      .single();

    if (crmLead) {
      email = crmLead.email;
      await supabase.from("outreach_crm_leads").update({ do_not_contact: true, status: "closed" }).eq("id", crmLead.id);
    }

    const { data: rawLead } = await supabase
      .from("outreach_raw_leads")
      .select("id, email")
      .eq("unsubscribe_token", token)
      .single();

    if (rawLead) {
      email = email || rawLead.email;
      await supabase.from("outreach_raw_leads").update({ do_not_contact: true, status: "rejected" }).eq("id", rawLead.id);
    }

    // Add to suppression list
    if (email) {
      let domain = "";
      try { domain = email.split("@")[1] || ""; } catch { /* ignore */ }

      await supabase.from("outreach_suppression").upsert({
        email: email.toLowerCase(),
        domain,
        reason: "unsubscribe",
        source: "self-service",
      }, { onConflict: "email" });
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Unsubscribed</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5}
.card{background:white;padding:40px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.1);text-align:center;max-width:400px}
h1{color:#333;margin-bottom:16px}p{color:#666;line-height:1.6}</style></head>
<body><div class="card">
<h1>✓ Unsubscribed</h1>
<p>You have been successfully unsubscribed from ICE Alarm España outreach emails.</p>
<p>You will no longer receive marketing communications from us.</p>
</div></body></html>`;

    return new Response(html, { headers: { "Content-Type": "text/html" } });
  } catch (e) {
    console.error("outreach-unsubscribe error:", e);
    return new Response("<html><body><h1>Error</h1><p>Something went wrong. Please try again later.</p></body></html>", {
      status: 500,
      headers: { "Content-Type": "text/html" },
    });
  }
});
