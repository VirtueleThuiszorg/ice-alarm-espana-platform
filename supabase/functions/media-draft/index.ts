import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";



interface MediaDraftRequest {
  topic: string;
  goal: string;
  target_audience: string;
  language: "en" | "es" | "both";
  post_id?: string;
  workflow_type?: "research" | "write" | "full";
}

interface MediaDraftOutput {
  research: {
    topic_insights: string;
    audience_insights: string;
    trending_angles: string;
    competitor_notes: string;
  };
  post_en: string;
  post_es: string;
  image_text: {
    headline: string;
    subheadline: string;
    cta: string;
  };
  hashtags_en: string[];
  hashtags_es: string[];
  compliance_notes: string;
}

// =============================================================================
// VARIETY ENGINE - Writing Styles, Formats, and Hooks
// =============================================================================

// Writing tone variations (randomly selected for each post)
const WRITING_TONES = [
  "heartfelt and emotional - focus on family connections and the emotional bond between generations. Use warm, tender language that evokes feelings of love and care.",
  "informative and educational - share valuable tips and facts. Use clear, authoritative language while remaining approachable. Include a specific insight or statistic.",
  "conversational and friendly - like chatting with a trusted neighbor over coffee. Use casual language, rhetorical questions, and relatable everyday scenarios.",
  "celebratory and positive - highlight independence, joy, and active living. Focus on empowerment and the positive aspects of aging gracefully.",
  "reassuring and calm - address common concerns and fears gently. Provide comfort and peace of mind without being alarmist or fear-mongering.",
  "inspiring and motivational - encourage active aging and living life to the fullest. Use uplifting language that inspires action and positivity.",
  "storytelling and narrative - weave a brief, compelling story that illustrates the benefit. Create a scene the reader can visualize and connect with emotionally.",
  "practical and solution-focused - address a specific problem and provide a clear solution. Be direct and action-oriented while remaining warm."
];

// Post format templates (different structures for variety)
const POST_FORMATS = [
  "story_format: Start with 'Imagine...' or 'Picture this...' and tell a brief, vivid scenario (3-4 sentences) that brings the reader into a moment. Then connect it to how ICE Alarm fits into that peaceful picture.",
  "question_hook: Open with a thought-provoking question that resonates deeply with the audience. Let the question hang for a beat, then answer it with warmth and insight.",
  "statistic_lead: Lead with a compelling, surprising statistic or fact about seniors, safety, or living in Spain. Use it as a springboard to discuss our solution naturally.",
  "tip_list: Present 2-3 quick, actionable tips in a numbered or bulleted format. Make them genuinely useful, then weave in how ICE Alarm complements these tips.",
  "testimonial_style: Write as if sharing a customer's experience (without using real names). Describe their situation before and the peace they feel now. Keep it authentic and relatable.",
  "day_in_life: Describe a typical peaceful day in the life of an ICE Alarm user. Show the device as a subtle, reassuring presence rather than the focus.",
  "myth_buster: Address a common misconception about elderly care, emergency pendants, or aging. Correct it gently with facts and warmth.",
  "comparison_angle: Contrast two scenarios - life with worry vs. life with peace of mind. Don't be fear-mongering; focus on the positive transformation.",
  "seasonal_connection: Connect the content to the current season, a holiday, or a timely event. Make it feel relevant and in-the-moment."
];

// Seasonal hooks based on time of year
const SEASONAL_HOOKS: Record<string, string[]> = {
  winter: [
    "staying safe and warm during the cooler months in Spain",
    "holiday season family gatherings and peace of mind for those living far from loved ones",
    "New Year resolutions for health and safety",
    "winter wellness tips for active seniors"
  ],
  spring: [
    "enjoying outdoor activities as the weather warms up",
    "gardening safely and staying connected",
    "spring cleaning and home safety refresher",
    "Easter family reunions and staying close despite distance"
  ],
  summer: [
    "beach days and outdoor adventures with confidence",
    "staying active and hydrated in the Spanish heat",
    "summer travel with peace of mind",
    "making the most of long summer days",
    "expat summer activities on the Costa Blanca"
  ],
  autumn: [
    "cozy indoor activities as the weather cools",
    "preparing for the coming winter months",
    "autumn walks and outdoor markets safely",
    "harvest season celebrations and family traditions"
  ]
};

// Opening line variations (hooks to grab attention)
const OPENING_HOOKS = [
  "There's something beautiful about...",
  "Here's what nobody tells you about...",
  "We often forget that...",
  "It starts with a simple moment...",
  "What if you could...",
  "The truth about living in Spain...",
  "You know that feeling when...",
  "Let's talk about something important...",
  "Every day, families across Spain...",
  "This might surprise you...",
  "Have you ever stopped to think about...",
  "In the heart of the Costa Blanca...",
  "Freedom looks different after 70...",
  "Your loved ones deserve...",
  "There's a reason so many expats choose..."
];

// CTA variations (instead of always the same call-to-action)
const CTA_VARIATIONS = [
  "Send us a message - we're here to help 💙",
  "Let's chat about what's right for you",
  "Message us today for a friendly conversation",
  "Questions? We'd love to hear from you",
  "Ready to learn more? Drop us a message",
  "Get in touch - no pressure, just answers",
  "We're just a message away 💙",
  "Start the conversation today",
  "Curious? Let's talk",
  "Your peace of mind starts with one message"
];

// =============================================================================
// VARIETY HELPER FUNCTIONS
// =============================================================================

function selectRandom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function getCurrentSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

function generateVarietyContext(): {
  tone: string;
  format: string;
  seasonalHook: string;
  openingHook: string;
  ctaVariation: string;
  emojiCount: string;
  hashtagCount: number;
} {
  const season = getCurrentSeason();
  return {
    tone: selectRandom(WRITING_TONES),
    format: selectRandom(POST_FORMATS),
    seasonalHook: selectRandom(SEASONAL_HOOKS[season]),
    openingHook: selectRandom(OPENING_HOOKS),
    ctaVariation: selectRandom(CTA_VARIATIONS),
    emojiCount: selectRandom(["minimal (1-2 emojis)", "moderate (3-4 emojis)", "expressive (5-6 emojis)"]),
    hashtagCount: Math.floor(Math.random() * 5) + 3 // 3-7 hashtags
  };
}

// =============================================================================
// COMPANY SETTINGS INTERFACE
// =============================================================================

interface CompanySettings {
  company_name: string;
  emergency_phone: string;
  support_email: string;
  address: string;
  website?: string;
}

const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  company_name: "ICE Alarm España",
  emergency_phone: "+34 900 123 456",
  support_email: "info@icealarm.es",
  address: "Calle Principal 1, Albox, 04800 Almería",
  website: "www.icealarm.es"
};

// =============================================================================
// ENHANCED SYSTEM PROMPT WITH VARIETY
// =============================================================================

function buildSystemPrompt(variety: ReturnType<typeof generateVarietyContext>, company: CompanySettings): string {
  return `You are the Media Manager, an AI assistant specializing in creating compelling Facebook marketing content for ${company.company_name} - a 24/7 emergency response service for seniors and expats in Spain.

## Your Primary Mission
Create draft social media posts that are:
1. Engaging and emotionally resonant with our target audiences
2. Compliant with healthcare/medical device marketing regulations
3. Bilingual (English and Spanish) to serve our diverse customer base
4. Action-oriented with clear CTAs

## CREATIVE VARIETY INSTRUCTIONS FOR THIS POST

For THIS specific post, apply these creative directions:

### WRITING TONE
${variety.tone}

### POST FORMAT
${variety.format}

### SEASONAL CONTEXT
Consider incorporating: ${variety.seasonalHook}

### OPENING STYLE
Consider starting with something like: "${variety.openingHook}" (but make it your own, don't copy exactly)

### CTA STYLE
End with a CTA in the style of: "${variety.ctaVariation}"

### EMOJI USAGE
Use ${variety.emojiCount} - place them thoughtfully, not just at the end

### HASHTAG COUNT
Include exactly ${variety.hashtagCount} relevant hashtags

## ANTI-REPETITION RULES (CRITICAL)
To keep content fresh, AVOID these overused patterns:
- Don't start every post with "At ${company.company_name}..." or "Here at ${company.company_name}..."
- Vary the position of the CTA (sometimes middle, sometimes end)
- Don't use "peace of mind" in every single post - find alternatives like "reassurance", "confidence", "security", "serenity"
- Don't always mention "24/7" - sometimes just say "always here" or "round-the-clock"
- Mix sentence lengths: combine short punchy lines with longer descriptive ones
- Vary paragraph structure (sometimes single block, sometimes broken into lines)
- Don't always address "seniors" - sometimes say "you", "families", "loved ones", "our members"

## CREATIVITY REQUIREMENTS
- Include at least ONE unexpected or creative element (metaphor, question, vivid imagery, mini-story)
- Occasionally address the reader directly ("You deserve...", "Have you ever...")
- Use sensory language when appropriate (sounds, sights, feelings)
- Make each post feel like it was written by a human with genuine care, not a template

## HARD RULES (Never Break These)
1. DRAFTS ONLY - Never suggest automatic publishing. All content requires human approval.
2. NO MEDICAL GUARANTEES - Never claim to save lives, prevent deaths, or guarantee medical outcomes
3. COMPLIANT WORDING - Use phrases like "provides reassurance", "helps connect to emergency services", "offers support"
4. ALWAYS INCLUDE CTA - Every post must include:
   - Website: ${company.website || "www.icealarm.es"}
   - Phone: ${company.emergency_phone}
   - A message/contact encouragement

## Forbidden Phrases (Never Use)
- "Will save your life"
- "Prevents death"
- "Guaranteed emergency response"
- "Medical device" (unless properly qualified)
- "Cure", "Treat", "Heal"
- "100% safe" or "completely safe"

## Brand Voice
Warm, reassuring, professional, caring, trustworthy. Never fear-mongering. Always empowering.

## Business Context
${company.company_name} is a 24/7 emergency response service providing GPS SOS pendants for seniors, expats, and anyone who wants peace of mind in Spain. 

Key Services:
- GPS SOS Pendant with one-button emergency calling
- Automatic fall detection
- 24/7 bilingual call center (English & Spanish)
- Coverage throughout Spain
- Two-way voice communication

Target Audiences:
1. British/European expats in Spain (often retirees)
2. Adult children of elderly parents in Spain
3. Healthcare professionals recommending our services
4. Elderly individuals seeking independence
5. Families of people with health conditions

Pricing: Individual from €27.49/month, Couples from €38.49/month. GPS Pendant €151.25 one-time.

## Output Format (ALWAYS use this exact JSON structure)
{
  "research": {
    "topic_insights": "Brief research findings about the topic (2-3 sentences)",
    "audience_insights": "What resonates with this target audience (2-3 sentences)",
    "trending_angles": "Current trends or timely hooks (2-3 sentences)",
    "competitor_notes": "What similar services are doing (1-2 sentences)"
  },
  "post_en": "The complete English post with hashtags and CTA - make it engaging and follow the creative directions above",
  "post_es": "The complete Spanish post with hashtags and CTA - not a direct translation, but culturally adapted",
  "image_text": {
    "headline": "Bold, attention-grabbing headline (max 6 words)",
    "subheadline": "Supporting text (max 10 words)",
    "cta": "Button text (2-4 words)"
  },
  "hashtags_en": ["#hashtag1", "#hashtag2", "..."],
  "hashtags_es": ["#hashtag1", "#hashtag2", "..."],
  "compliance_notes": "Any compliance considerations for this specific post"
}

Respond ONLY with valid JSON matching this structure.`;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Fetch company settings from database
    const { data: settingsData } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["settings_company_name", "settings_emergency_phone", "settings_support_email", "settings_address", "settings_website"]);

    const settingsMap = (settingsData || []).reduce((acc, setting) => {
      const normalizedKey = setting.key.replace(/^settings_/, '');
      acc[normalizedKey] = setting.value;
      return acc;
    }, {} as Record<string, string>);

    const company: CompanySettings = {
      company_name: settingsMap.company_name || DEFAULT_COMPANY_SETTINGS.company_name,
      emergency_phone: settingsMap.emergency_phone || DEFAULT_COMPANY_SETTINGS.emergency_phone,
      support_email: settingsMap.support_email || DEFAULT_COMPANY_SETTINGS.support_email,
      address: settingsMap.address || DEFAULT_COMPANY_SETTINGS.address,
      website: settingsMap.website || DEFAULT_COMPANY_SETTINGS.website
    };

    console.log("Using company settings:", company.company_name, company.emergency_phone);

    const { topic, goal, target_audience, language, post_id, workflow_type = "full" }: MediaDraftRequest = await req.json();

    if (!topic) {
      throw new Error("Topic is required");
    }

    // Generate variety context for this specific post
    const variety = generateVarietyContext();
    console.log("Variety context:", {
      tone: variety.tone.substring(0, 30) + "...",
      format: variety.format.substring(0, 30) + "...",
      season: getCurrentSeason(),
      emojiCount: variety.emojiCount,
      hashtagCount: variety.hashtagCount
    });

    console.log("Media draft request:", { topic, goal, target_audience, language, post_id, workflow_type });

    // Map goal and audience to readable labels
    const goalLabels: Record<string, string> = {
      brand_awareness: "Brand Awareness - focus on establishing trust and recognition",
      lead_generation: "Lead Generation - encourage contact and conversation",
      engagement: "Engagement - spark comments, shares, and interaction",
      education: "Education - inform and provide value",
      promotion: "Promotion - highlight a specific offer or benefit",
    };

    const audienceLabels: Record<string, string> = {
      expats_spain: "British/European expats living in Spain - often retirees who moved for the lifestyle, weather, and relaxed pace. They value community, staying connected with family abroad, and maintaining independence.",
      elderly_care: "Seniors and elderly individuals (70+) seeking independence - they want to stay in their homes, live actively, and not be a burden on their families. Dignity and autonomy are paramount.",
      family_caregivers: "Adult children (40-60) caring for elderly parents in Spain - they're often worried, sometimes living in another country, and feel guilty they can't be there. They want reassurance and a practical solution.",
      healthcare_pros: "Healthcare professionals who may recommend our services - they value clinical accuracy, reliability, and proven solutions. They need to trust the service before recommending.",
      general: "General audience interested in safety, wellbeing, and peace of mind - a mix of ages and situations, all sharing a desire for security and connection.",
    };

    const languageInstructions: Record<string, string> = {
      en: "Focus primarily on the English version. Make it compelling for English-speaking audiences, particularly British expats.",
      es: "Focus primarily on the Spanish version. Make it natural, warm, and compelling for Spanish-speaking audiences. Use authentic Spanish expressions.",
      both: "Create equally compelling versions in both English and Spanish. The Spanish version should NOT be a direct translation - adapt it culturally with appropriate expressions, tone, and references that resonate with Spanish speakers.",
    };

    // Build the user message with variety context and company details
    const userMessage = `Create a Facebook post draft with the following parameters:

**Topic**: ${topic}
**Goal**: ${goalLabels[goal] || goal || "Not specified"}
**Target Audience**: ${audienceLabels[target_audience] || target_audience || "General audience"}
**Language Focus**: ${language} - ${languageInstructions[language] || "Create both English and Spanish versions"}

**Current Season**: ${getCurrentSeason().charAt(0).toUpperCase() + getCurrentSeason().slice(1)} - consider seasonal relevance

Please generate:
1. Research insights for this topic and audience
2. Complete English post with appropriate hashtags and CTA (following the creative variety instructions in your system prompt)
3. Complete Spanish post with appropriate hashtags and CTA (culturally adapted, not just translated)
4. Image text suggestions (headline, subheadline, CTA button)
5. Compliance notes for this specific content

Remember: 
- Follow the CREATIVE VARIETY INSTRUCTIONS in your system prompt for this specific post
- Each post should feel fresh and unique, not templated
- Include contact info: ${company.website || "www.icealarm.es"} and ${company.emergency_phone}`;

    console.log("Calling Lovable AI with variety engine...");

    // Build system prompt with variety and company settings
    const systemPrompt = buildSystemPrompt(variety, company);

    // Call Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.85, // Slightly higher temperature for more creativity
        max_tokens: 3500,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted, please add funds" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI Gateway error: ${aiResponse.status} - ${errorText}`);
    }

    const aiResult = await aiResponse.json();
    const responseContent = aiResult.choices?.[0]?.message?.content || "";

    console.log("AI Response received:", responseContent.substring(0, 200));

    // Parse the AI response
    let parsedOutput: MediaDraftOutput;
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedOutput = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No valid JSON found in response");
      }
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      throw new Error("Failed to parse AI response as JSON. Please try again.");
    }

    // If post_id provided, save to database
    if (post_id) {
      console.log("Saving to database for post_id:", post_id);

      // Save research
      const { error: researchError } = await supabase
        .from("social_post_research")
        .upsert({
          post_id,
          sources: [],
          key_points: JSON.stringify(parsedOutput.research),
          compliance_notes: parsedOutput.compliance_notes,
        }, {
          onConflict: "post_id",
        });

      if (researchError) {
        console.error("Error saving research:", researchError);
      }

      // Determine post_text based on language preference
      let postText = "";
      if (language === "en") {
        postText = parsedOutput.post_en;
      } else if (language === "es") {
        postText = parsedOutput.post_es;
      } else {
        // Both languages - combine with separator
        postText = `🇬🇧 ENGLISH:\n${parsedOutput.post_en}\n\n---\n\n🇪🇸 ESPAÑOL:\n${parsedOutput.post_es}`;
      }

      // Update the post with generated text
      const { error: postError } = await supabase
        .from("social_posts")
        .update({
          post_text: postText,
          updated_at: new Date().toISOString(),
        })
        .eq("id", post_id);

      if (postError) {
        console.error("Error updating post:", postError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        output: parsedOutput,
        variety_used: {
          tone: variety.tone.substring(0, 50) + "...",
          format: variety.format.substring(0, 50) + "...",
          season: getCurrentSeason(),
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Media draft error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
