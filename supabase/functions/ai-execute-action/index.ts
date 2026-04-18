import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";



serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    const { actionId } = await req.json();

    if (!actionId) {
      throw new Error("actionId is required");
    }

    // Load the action
    const { data: action, error: actionError } = await supabase
      .from("ai_actions")
      .select("*, ai_runs(agent_id, ai_agents(agent_key, name))")
      .eq("id", actionId)
      .single();

    if (actionError || !action) {
      throw new Error(`Action not found: ${actionId}`);
    }

    // Check if action is approved for execution
    if (action.status !== "approved") {
      return new Response(
        JSON.stringify({ success: false, message: `Action status is ${action.status}, not approved` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: any = null;
    let errorMessage: string | null = null;

    try {
      switch (action.action_type) {
        case "whatsapp_notify": {
          // Call the existing twilio-whatsapp function
          const { to, message } = action.payload;
          
          // Get admin phone from system settings or use provided number
          let adminPhone = to;
          if (!adminPhone) {
            const { data: settings } = await supabase
              .from("system_settings")
              .select("value")
              .eq("key", "admin_whatsapp_number")
              .single();
            adminPhone = settings?.value;
          }

          if (!adminPhone) {
            throw new Error("No admin WhatsApp number configured");
          }

          const whatsappResponse = await fetch(
            `${SUPABASE_URL}/functions/v1/twilio-whatsapp`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                to: adminPhone,
                message: `🤖 AI Agent (${action.ai_runs?.ai_agents?.name || "Unknown"}):\n\n${message}`,
              }),
            }
          );

          if (!whatsappResponse.ok) {
            throw new Error(`WhatsApp send failed: ${await whatsappResponse.text()}`);
          }

          result = await whatsappResponse.json();
          break;
        }

        case "task_create": {
          const { title, description, priority, member_id, due_date } = action.payload;
          
          // Get a default staff ID for task assignment (could be enhanced)
          const { data: staff } = await supabase
            .from("staff")
            .select("id")
            .eq("role", "admin")
            .eq("is_active", true)
            .limit(1)
            .single();

          const { data: task, error: taskError } = await supabase
            .from("tasks")
            .insert({
              title: title || "AI-generated task",
              description: description || "",
              priority: priority || "medium",
              member_id: member_id || null,
              assigned_to: staff?.id || null,
              status: "pending",
              source: "ai_agent",
            })
            .select()
            .single();

          if (taskError) {
            throw new Error(`Task creation failed: ${taskError.message}`);
          }

          result = { taskId: task.id, title: task.title };
          break;
        }

        case "note_create": {
          const { member_id, content, note_type, is_pinned } = action.payload;
          
          if (!member_id) {
            throw new Error("member_id is required for note creation");
          }

          const { data: note, error: noteError } = await supabase
            .from("member_notes")
            .insert({
              member_id,
              content: content || "",
              note_type: note_type || "ai_generated",
              is_pinned: is_pinned || false,
            })
            .select()
            .single();

          if (noteError) {
            throw new Error(`Note creation failed: ${noteError.message}`);
          }

          result = { noteId: note.id };
          break;
        }

        case "escalate": {
          const { conversation_id, reason, priority } = action.payload;
          
          if (conversation_id) {
            // Update conversation status to escalated
            await supabase
              .from("conversations")
              .update({
                status: "escalated",
                priority: priority || "high",
              })
              .eq("id", conversation_id);
          }

          // Create an event for the Main Brain to pick up
          const { data: event } = await supabase
            .from("ai_events")
            .insert({
              event_type: "conversation.escalated",
              entity_type: "conversation",
              entity_id: conversation_id,
              payload: { reason, escalated_by: action.ai_runs?.ai_agents?.agent_key },
            })
            .select()
            .single();

          result = { eventId: event?.id, escalated: true };
          break;
        }

        case "lead_create": {
          const { first_name, last_name, email, phone, source, message } = action.payload;
          
          const { data: lead, error: leadError } = await supabase
            .from("leads")
            .insert({
              first_name: first_name || "Unknown",
              last_name: last_name || "",
              email: email || "",
              phone: phone || "",
              source: source || "ai_chat",
              message: message || "",
              status: "new",
            })
            .select()
            .single();

          if (leadError) {
            throw new Error(`Lead creation failed: ${leadError.message}`);
          }

          result = { leadId: lead.id };
          break;
        }

        case "ticket_create": {
          const { title, description, category, priority, member_id } = action.payload;
          
          // Get a default staff ID for ticket creation
          const { data: staff } = await supabase
            .from("staff")
            .select("id")
            .eq("is_active", true)
            .limit(1)
            .single();

          if (!staff) {
            throw new Error("No active staff found to create ticket");
          }

          // Generate ticket number
          const ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}`;

          const { data: ticket, error: ticketError } = await supabase
            .from("internal_tickets")
            .insert({
              ticket_number: ticketNumber,
              title: title || "AI-generated ticket",
              description: description || "",
              category: category || "general",
              priority: priority || "normal",
              member_id: member_id || null,
              created_by: staff.id,
              status: "open",
            })
            .select()
            .single();

          if (ticketError) {
            throw new Error(`Ticket creation failed: ${ticketError.message}`);
          }

          result = { ticketId: ticket.id, ticketNumber: ticket.ticket_number };
          break;
        }

        case "chat_reply":
        case "draft_response": {
          // These are handled differently - stored as proposed responses
          // The actual sending happens through the UI or another system
          result = { 
            type: action.action_type,
            message: action.payload.message,
            status: "draft_saved"
          };
          break;
        }

        case "request_human": {
          const { conversation_id, reason } = action.payload;
          
          // Update conversation to need human attention
          if (conversation_id) {
            await supabase
              .from("conversations")
              .update({
                status: "needs_attention",
                priority: "high",
              })
              .eq("id", conversation_id);
          }

          // Create an internal ticket for human follow-up
          const { data: staff } = await supabase
            .from("staff")
            .select("id")
            .eq("is_active", true)
            .limit(1)
            .single();

          if (staff) {
            const ticketNumber = `HMN-${Date.now().toString(36).toUpperCase()}`;
            await supabase
              .from("internal_tickets")
              .insert({
                ticket_number: ticketNumber,
                title: "Human takeover requested by AI",
                description: reason || "AI agent requested human intervention",
                category: "customer_service",
                priority: "high",
                created_by: staff.id,
                status: "open",
              });
          }

          result = { humanRequested: true, reason };
          break;
        }

        default:
          throw new Error(`Unknown action type: ${action.action_type}`);
      }

      // Update action as executed
      await supabase
        .from("ai_actions")
        .update({
          status: "executed",
          executed_at: new Date().toISOString(),
          result,
        })
        .eq("id", actionId);

    } catch (execError) {
      errorMessage = execError instanceof Error ? execError.message : "Execution failed";
      
      // Update action with error
      await supabase
        .from("ai_actions")
        .update({
          status: "failed",
          error_message: errorMessage,
        })
        .eq("id", actionId);
    }

    return new Response(
      JSON.stringify({
        success: !errorMessage,
        actionId,
        actionType: action.action_type,
        result,
        error: errorMessage,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("ai-execute-action error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
