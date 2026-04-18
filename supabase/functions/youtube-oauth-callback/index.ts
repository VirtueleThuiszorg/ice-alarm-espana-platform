import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPECTED_CHANNEL_ID = "UCT9_R7Czan0lPFvq5XyV5kg";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    // Create HTML response helper
    const htmlResponse = (message: string, success: boolean) => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>YouTube Connection</title>
          <style>
            body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
            .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; }
            .success { color: #22c55e; }
            .error { color: #ef4444; }
            h1 { font-size: 1.5rem; margin-bottom: 1rem; }
            p { color: #666; margin-bottom: 1.5rem; }
            button { background: #3b82f6; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; cursor: pointer; font-size: 1rem; }
            button:hover { background: #2563eb; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 class="${success ? 'success' : 'error'}">${success ? '✓ Connected' : '✗ Error'}</h1>
            <p>${message}</p>
            <button onclick="window.close()">Close Window</button>
          </div>
          <script>
            // Notify parent window
            if (window.opener) {
              window.opener.postMessage({ type: 'youtube-oauth-complete', success: ${success} }, '*');
            }
          </script>
        </body>
        </html>
      `;
      return new Response(html, {
        headers: { "Content-Type": "text/html" },
      });
    };

    if (error) {
      return htmlResponse(`Authorization denied: ${error}`, false);
    }

    if (!code || !state) {
      return htmlResponse("Missing authorization code or state", false);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify state
    const { data: stateRecord } = await supabase
      .from("system_integrations")
      .select("metadata")
      .eq("integration_type", "youtube_oauth_state")
      .single();

    if (!stateRecord || stateRecord.metadata?.state !== state) {
      return htmlResponse("Invalid state token - possible CSRF attack", false);
    }

    const userId = stateRecord.metadata?.user_id;

    // Exchange code for tokens
    const redirectUri = `${supabaseUrl}/functions/v1/youtube-oauth-callback`;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenResponse.json();
    if (tokens.error) {
      return htmlResponse(`Token exchange failed: ${tokens.error_description || tokens.error}`, false);
    }

    // Fetch channel info
    const channelResponse = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    const channelData = await channelResponse.json();
    if (!channelData.items || channelData.items.length === 0) {
      return htmlResponse("No YouTube channel found for this account", false);
    }

    const channel = channelData.items[0];
    const channelId = channel.id;
    const channelName = channel.snippet.title;
    const channelThumbnail = channel.snippet.thumbnails?.default?.url;

    // Check if channel matches expected
    const channelMismatch = channelId !== EXPECTED_CHANNEL_ID;

    // Calculate expiry
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Store integration (upsert)
    const { error: upsertError } = await supabase.from("system_integrations").upsert({
      integration_type: "youtube",
      provider: "google",
      channel_id: channelId,
      channel_name: channelName,
      access_token_encrypted: tokens.access_token,
      refresh_token_encrypted: tokens.refresh_token,
      scopes: tokens.scope?.split(" ") || [],
      status: "connected",
      connected_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
      expires_at: expiresAt,
      connected_by: userId,
      metadata: {
        thumbnail_url: channelThumbnail,
        channel_mismatch: channelMismatch,
        expected_channel_id: EXPECTED_CHANNEL_ID,
      },
    }, { onConflict: "integration_type" });

    if (upsertError) {
      console.error("Failed to store integration:", upsertError);
      return htmlResponse("Failed to save integration", false);
    }

    // Clean up state record
    await supabase
      .from("system_integrations")
      .delete()
      .eq("integration_type", "youtube_oauth_state");

    const message = channelMismatch
      ? `Connected to "${channelName}" (Warning: Channel ID does not match expected ICE Alarm España channel)`
      : `Successfully connected to "${channelName}"`;

    return htmlResponse(message, true);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("YouTube OAuth callback error:", error);
    return new Response(`Error: ${errorMessage}`, { status: 500 });
  }
});
