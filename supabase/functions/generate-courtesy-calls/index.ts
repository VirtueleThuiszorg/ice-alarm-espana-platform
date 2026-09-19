import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { nextCallDateString } from "../_shared/courtesy-schedule.ts";



Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date();
    const todayDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Fetch all active members with courtesy calls enabled
    const { data: members, error: membersError } = await supabase
      .from("members")
      .select("id, first_name, last_name, phone, created_at, courtesy_call_frequency, next_courtesy_call_date")
      .eq("status", "active")
      .eq("courtesy_calls_enabled", true);

    if (membersError) {
      console.error("Error fetching members:", membersError);
      throw membersError;
    }

    console.log(`Found ${members?.length || 0} active members with courtesy calls enabled`);

    let tasksCreated = 0;
    let tasksSkipped = 0;

    // The next-call date rule lives in `_shared/courtesy-schedule.ts`. The copy that used to sit
    // here overflowed the month — 31 Jan + 1 month came out as 3 March — while the member's
    // record clamped it to 28 February, so the two disagreed for anyone called near month end.

    // Helper function to get frequency label for task title
    const getFrequencyLabel = (frequency: string): string => {
      switch (frequency) {
        case "daily": return "Daily";
        case "weekly": return "Weekly";
        case "bi-weekly": return "Bi-weekly";
        case "quarterly": return "Quarterly";
        case "monthly":
        default:
          return "Monthly";
      }
    };

    // Helper function to check if task should be generated based on frequency
    const shouldGenerateTask = (frequency: string, nextCallDate: string | null): boolean => {
      const todayStr = today.toISOString().split("T")[0];
      
      // If next call date is set, check if it's today or in the past
      if (nextCallDate) {
        return nextCallDate <= todayStr;
      }
      
      // If no next call date is set, generate task (first time)
      return true;
    };

    for (const member of members || []) {
      const frequency = (member as { courtesy_call_frequency?: string }).courtesy_call_frequency || "monthly";
      const nextCallDate = member.next_courtesy_call_date;

      // Check if we should generate a task based on frequency
      if (!shouldGenerateTask(frequency, nextCallDate)) {
        continue;
      }

      // Check if a courtesy call task already exists for this member today (to avoid duplicates)
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);

      const { data: existingTasks, error: tasksError } = await supabase
        .from("tasks")
        .select("id")
        .eq("member_id", member.id)
        .eq("task_type", "courtesy_call")
        .gte("created_at", todayStart.toISOString())
        .lte("created_at", todayEnd.toISOString());

      if (tasksError) {
        console.error(`Error checking existing tasks for member ${member.id}:`, tasksError);
        continue;
      }

      if (existingTasks && existingTasks.length > 0) {
        console.log(`Courtesy call task already exists for member ${member.id} today`);
        tasksSkipped++;
        continue;
      }

      // Create new courtesy call task
      const dueDate = new Date();
      dueDate.setHours(17, 0, 0, 0); // Set due time to 5 PM

      const frequencyLabel = getFrequencyLabel(frequency);
      const { error: insertError } = await supabase.from("tasks").insert({
        title: `${frequencyLabel} Courtesy Call - ${member.first_name} ${member.last_name}`,
        description: `${frequencyLabel} check-in call for ${member.first_name} ${member.last_name}. Phone: ${member.phone || 'N/A'}`,
        member_id: member.id,
        task_type: "courtesy_call",
        priority: "normal",
        status: "pending",
        due_date: dueDate.toISOString(),
      });

      if (insertError) {
        console.error(`Error creating courtesy call task for member ${member.id}:`, insertError);
        continue;
      }

      console.log(`Created ${frequencyLabel.toLowerCase()} courtesy call task for member ${member.id}`);
      tasksCreated++;

      // Update next courtesy call date for the member based on frequency
      await supabase
        .from("members")
        .update({ next_courtesy_call_date: nextCallDateString(frequency, today) })
        .eq("id", member.id);
    }

    const response = {
      success: true,
      date: today.toISOString(),
      tasksCreated,
      tasksSkipped,
      totalMembersChecked: members?.length || 0,
    };

    console.log("Courtesy call generation complete:", response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    console.error("Error generating courtesy calls:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
