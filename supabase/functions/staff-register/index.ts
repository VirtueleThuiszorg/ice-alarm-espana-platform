import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { staffRegisterSchema, validateRequest } from "../_shared/validation.ts";

interface StaffRegistrationRequest {
  email: string;
  first_name: string;
  last_name: string;
  role: "admin" | "call_centre_supervisor" | "call_centre";
  phone?: string;
  preferred_language?: "en" | "es";
  // Optional fields admin may fill in
  date_of_birth?: string;
  nationality?: string;
  nie_number?: string;
  social_security_number?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  hire_date?: string;
  department?: string;
  position?: string;
  contract_type?: string;
  notes?: string;
  personal_mobile?: string;
  escalation_priority?: number;
  is_on_call?: boolean;
  annual_holiday_days?: number;
}

function generateSecurePassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the caller's JWT and get their role
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;

    // Check if user is admin or super_admin
    const { data: staffData, error: staffError } = await userClient
      .from("staff")
      .select("id, role")
      .eq("user_id", userId)
      .eq("is_active", true)
      .single();

    if (staffError || !staffData) {
      return new Response(
        JSON.stringify({ error: "Not authorized - staff record not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["admin", "super_admin"].includes(staffData.role)) {
      return new Response(
        JSON.stringify({ error: "Only admins can create staff accounts" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse and validate request body
    const rawBody = await req.json();
    const validated = validateRequest(staffRegisterSchema, rawBody, corsHeaders);
    if (validated.error) return validated.error;
    const body = validated.data as StaffRegistrationRequest;

    // Create admin client for user creation
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check if email already exists in staff table
    const { data: existingStaff } = await adminClient
      .from("staff")
      .select("id")
      .eq("email", body.email.toLowerCase())
      .maybeSingle();

    if (existingStaff) {
      return new Response(
        JSON.stringify({ error: "A staff member with this email already exists" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create auth user with random unguessable password
    // Nobody needs to know this password — the staff member will set their own via the invite wizard
    const randomPassword = generateSecurePassword();

    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email: body.email.toLowerCase(),
      password: randomPassword,
      email_confirm: true,
      user_metadata: {
        first_name: body.first_name,
        last_name: body.last_name,
        role: "staff",
      },
    });

    if (authError || !authUser.user) {
      console.error("Error creating auth user:", authError);
      return new Response(
        JSON.stringify({ error: authError?.message || "Failed to create user account" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the staff record with all fields provided by admin
    const staffRecord: Record<string, unknown> = {
      user_id: authUser.user.id,
      email: body.email.toLowerCase(),
      first_name: body.first_name,
      last_name: body.last_name,
      role: body.role,
      phone: body.phone || null,
      preferred_language: body.preferred_language || "en",
      status: "pending",
    };

    // Add optional fields if provided
    const optionalFields = [
      "date_of_birth", "nationality", "nie_number", "social_security_number",
      "address_line1", "address_line2", "city", "province", "postal_code", "country",
      "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship",
      "hire_date", "department", "position", "contract_type", "notes",
      "personal_mobile", "escalation_priority", "is_on_call", "annual_holiday_days",
    ];

    for (const field of optionalFields) {
      const value = (body as unknown as Record<string, unknown>)[field];
      if (value !== undefined && value !== null && value !== "") {
        staffRecord[field] = value;
      }
    }

    // Insert staff record
    const { data: newStaff, error: staffInsertError } = await adminClient
      .from("staff")
      .insert(staffRecord)
      .select("id")
      .single();

    if (staffInsertError || !newStaff) {
      console.error("Error inserting staff record:", staffInsertError);
      // Rollback: delete the auth user we just created
      await adminClient.auth.admin.deleteUser(authUser.user.id);
      return new Response(
        JSON.stringify({ error: "Failed to create staff record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log activity
    await adminClient.from("activity_logs").insert({
      action: "staff_created",
      entity_type: "staff",
      entity_id: newStaff.id,
      staff_id: null,
      new_values: {
        email: body.email.toLowerCase(),
        role: body.role,
        created_by_user_id: userId,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        staff_id: newStaff.id,
        message: "Staff member created successfully. Send them an invitation from their profile.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in staff-register function:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
