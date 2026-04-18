import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";



// =============================================================================
// IMAGE VARIETY ENGINE - Locations, Lighting, Activities, Subjects, Compositions
// =============================================================================

// Location variations for Mediterranean Spain scenes
const LOCATION_VARIANTS = [
  "a sun-drenched terrace overlooking the Mediterranean sea with terracotta pots and climbing bougainvillea",
  "a charming Andalusian courtyard with colorful ceramic tiles, potted geraniums, and a trickling fountain",
  "an ancient olive grove with gnarled silver-green trees and dappled golden sunlight",
  "a seaside promenade at golden hour with palm trees swaying and yachts in the marina",
  "a traditional Spanish plaza with café tables, orange trees, and historic architecture",
  "a vibrant flower garden with stone walls, lavender bushes, and rosemary hedges",
  "a rustic vineyard in La Rioja with rows of vines and distant rolling hills",
  "a whitewashed village street in Costa Blanca with blue shutters and flowering balconies",
  "a modern apartment balcony with stylish furniture and panoramic sea views",
  "a peaceful park setting with mature pine trees providing shade and a distant mountain view",
  "a cozy outdoor café terrace with checkered tablecloths and the aroma of fresh coffee",
  "a traditional Spanish market with colorful produce stalls and festive atmosphere",
  "a quiet beach cove with crystal clear turquoise water and soft morning light",
  "a hillside garden overlooking a picturesque Spanish village with terracotta rooftops"
];

// Time of day and lighting variations
const LIGHTING_VARIANTS = [
  "warm golden hour morning light with long soft shadows and a gentle glow",
  "bright midday Spanish sun with vibrant saturated colors and clear blue skies",
  "soft overcast day with even, gentle lighting and muted tones perfect for portraits",
  "late afternoon warmth with rich amber and honey tones as the sun gets lower",
  "early morning mist with soft diffused light and a peaceful, dreamy atmosphere",
  "magic hour just before sunset with dramatic orange and pink hues in the sky",
  "dappled light filtering through tree leaves creating beautiful natural patterns",
  "bright but soft light of a Spanish spring morning with fresh, clear quality"
];

// Activity variations showing engaged, active seniors
const ACTIVITY_VARIANTS = [
  "enjoying a leisurely cup of café con leche at an outdoor table",
  "reading a favorite book in a comfortable wicker chair",
  "walking happily with a friendly small dog on a lead",
  "tending lovingly to colorful flowers in a terracotta pot",
  "playing a friendly game of cards or dominoes with companions",
  "sharing lunch with dear friends, laughing and conversing",
  "doing gentle stretching exercises in the fresh morning air",
  "chatting warmly on the phone with a loved family member",
  "painting a watercolor at an easel, focused and content",
  "watching the sunset from a balcony with a glass of wine",
  "strolling arm-in-arm with a partner through a market",
  "photographing beautiful flowers in a garden",
  "practicing tai chi in a peaceful park setting",
  "writing in a journal at a café table",
  "feeding pigeons in a sunny plaza"
];

// Subject demographic variations for authentic representation
const SUBJECT_VARIANTS = [
  "a cheerful woman in her early 70s with elegant silver-grey hair and a warm, genuine smile",
  "a distinguished gentleman in his late 60s with salt-and-pepper hair and kind, twinkling eyes",
  "a loving couple in their 70s, holding hands affectionately and clearly devoted to each other",
  "an elegant woman in her early 80s, impeccably dressed with classic style and quiet confidence",
  "a fit, healthy-looking man in his early 70s with a tan from outdoor living and an active demeanor",
  "a grandmother figure with soft white hair, a warm cardigan, and an inviting, nurturing presence",
  "a stylish retired professional woman in her late 60s, modern and sophisticated",
  "a friendly widower in his mid-70s with a gentle expression and relaxed posture",
  "a vibrant couple in their late 60s who look active and adventurous",
  "an artistic-looking woman in her 70s with expressive eyes and bohemian style",
  "a retired doctor or professor in his 70s, intellectual but approachable",
  "a Spanish grandmother (abuela) with dark eyes, a floral dress, and a loving expression"
];

// Camera and composition variations for visual variety
const COMPOSITION_VARIANTS = [
  "medium shot with subject centered, showing environmental context and lifestyle",
  "close-up portrait style with shallow depth of field, focusing on genuine expression",
  "wide establishing shot showing the beautiful Spanish setting with subject as focal point",
  "candid moment captured naturally, slightly off-center composition with authentic feel",
  "three-quarter view showing natural interaction with the environment",
  "over-the-shoulder perspective showing what the subject is looking at or doing",
  "environmental portrait with strong sense of place and atmosphere",
  "dynamic composition with interesting foreground elements and depth"
];

// Outfit/styling variations for authenticity
const STYLING_VARIANTS = [
  "wearing comfortable, elegant casual clothing in soft natural colors",
  "dressed in classic Mediterranean style with linen and light fabrics",
  "in relaxed weekend attire, looking comfortable and at ease",
  "wearing a tasteful polo shirt and light trousers, casual but put-together",
  "dressed in a flowing summer dress or blouse in cheerful colors",
  "in practical but stylish outdoor wear, ready for a walk",
  "wearing a classic cardigan over a simple blouse, timeless and warm",
  "in smart casual attire that reflects an active, engaged lifestyle"
];

// Base style templates (kept for backward compatibility and style selection)
const IMAGE_STYLES: Record<string, string> = {
  senior_active: "An active, healthy senior enjoying outdoor activities, radiating vitality and independence. The person looks happy, engaged with life, and full of energy.",
  family_peace: "A tender moment between generations - an adult child and their elderly parent sharing a warm, loving connection. The scene conveys trust, care, and family bonds.",
  pendant_focus: "A lifestyle shot where the SOS pendant is naturally visible as part of the outfit. The focus is on the person's confident, independent lifestyle with the pendant as a subtle but present element.",
  spanish_lifestyle: "The quintessential Spanish Mediterranean lifestyle - relaxed, sunny, beautiful surroundings. The scene captures the joy of living in Spain with its perfect weather and laid-back culture.",
  independence: "A senior going about daily life with confidence and freedom - shopping, walking, enjoying hobbies. The image conveys self-sufficiency and the joy of independent living.",
  peace_of_mind: "A serene, peaceful scene showing contentment and security. The atmosphere is calm and reassuring, suggesting a life free from worry.",
  social_connection: "Friends meeting for coffee, playing cards, or enjoying a community activity. The scene shows the importance of social bonds and community for wellbeing.",
  daily_routine: "A peaceful morning routine - coffee on the balcony, reading the paper, gentle stretching. The image shows the beauty in simple, everyday moments.",
  outdoor_adventure: "An active senior enjoying nature - walking on the beach, hiking a gentle trail, exploring a garden. Adventure and exploration at a comfortable pace.",
  home_comfort: "The safety and comfort of a beautiful Spanish home - a cozy living room, a sunny kitchen, a welcoming entrance. Security and belonging.",
  technology_simple: "A senior comfortably using modern technology - the pendant, a tablet, a phone call with family. Technology that empowers rather than complicates.",
  surprise_me: "A unique, unexpected scene that captures the spirit of independent, joyful living in Spain. Be creative and original while staying on-brand."
};

interface ImageTextData {
  headline?: string;
  subheadline?: string;
  cta?: string;
}

interface RequestBody {
  style: string;
  topic?: string;
  image_text?: ImageTextData;
  post_id?: string;
  post_text?: string;
}

interface CompanySettings {
  company_name: string;
  emergency_phone: string;
  support_email: string;
  address: string;
}

const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  company_name: "ICE Alarm España",
  emergency_phone: "+34 900 123 456",
  support_email: "info@icealarm.es",
  address: "Calle Principal 1, Albox, 04800 Almería"
};

// Helper function to select random element
function selectRandom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function buildImagePrompt(style: string, company: CompanySettings, topic?: string, imageText?: ImageTextData, postText?: string): string {
  const baseContext = `Create a professional, high-quality social media image for ${company.company_name}, a trusted 24/7 emergency response service for seniors living in Spain.`;
  
  // Select random variety elements
  const location = selectRandom(LOCATION_VARIANTS);
  const lighting = selectRandom(LIGHTING_VARIANTS);
  const activity = selectRandom(ACTIVITY_VARIANTS);
  const subject = selectRandom(SUBJECT_VARIANTS);
  const composition = selectRandom(COMPOSITION_VARIANTS);
  const styling = selectRandom(STYLING_VARIANTS);
  
  // Special handling for "from_post_text" style
  if (style === "from_post_text" && postText) {
    const cleanPostText = postText.substring(0, 800);
    return `${baseContext}

Create an image that visually represents this social media post content:

"${cleanPostText}"

SCENE DETAILS (randomly selected for variety):
- Location: ${location}
- Subject: ${subject}
- Activity: ${activity}
- Lighting: ${lighting}
- Styling: ${styling}
- Composition: ${composition}

CRITICAL Requirements:
- Professional lifestyle photography quality, sharp and well-composed
- Warm, caring, and reassuring emotional tone
- THE PERSON MUST BE WEARING A VISIBLE SOS/EMERGENCY PENDANT around their neck on a lanyard or elegant chain - this is MANDATORY and should be clearly visible
- The pendant should be a small, sleek, modern emergency device (similar to a medical alert pendant)
- DO NOT include any text, logos, watermarks, or overlays in the image
- Suitable for Facebook marketing (1200x630 landscape aspect ratio)
- Natural, authentic representation - avoid stock photo clichés
- Avoid clinical, hospital, or sterile medical settings
- Focus on independence, dignity, peace of mind, and active living
- Use warm Mediterranean color palette (golden light, azure skies, terracotta, olive greens)
- The scene should feel genuine and unposed, like a beautiful moment captured naturally`;
  }
  
  // Special handling for "surprise_me" style - fully randomized
  if (style === "surprise_me") {
    const randomBaseStyle = selectRandom(Object.keys(IMAGE_STYLES).filter(s => s !== "surprise_me" && s !== "from_post_text"));
    const styleDescription = IMAGE_STYLES[randomBaseStyle];
    
    return `${baseContext}

CREATIVE DIRECTION: ${styleDescription}

UNIQUE SCENE COMPOSITION:
- Setting: ${location}
- Subject: ${subject}
- Doing: ${activity}
- Lighting: ${lighting}
- Wearing: ${styling}
- Camera: ${composition}

${topic ? `Content theme: ${topic}` : ""}

CRITICAL Requirements:
- Professional lifestyle photography quality with artistic flair
- Create something visually interesting and unique - avoid typical stock photo setups
- THE PERSON MUST BE WEARING A VISIBLE SOS/EMERGENCY PENDANT around their neck - this is MANDATORY
- The pendant should be clearly visible on a lanyard or elegant chain
- DO NOT include any text, logos, watermarks, or overlays
- Suitable for Facebook (1200x630 landscape)
- Natural, authentic representation with genuine emotion
- Warm Mediterranean color palette (golds, blues, terracottas, greens)
- The image should tell a story and evoke positive emotion`;
  }
  
  // Standard style with variety modifiers
  const styleDescription = IMAGE_STYLES[style] || IMAGE_STYLES.senior_active;
  
  const topicContext = topic ? `\n\nContent theme to reflect: ${topic}` : "";
  
  return `${baseContext}

STYLE DIRECTION: ${styleDescription}

SCENE VARIETY (use these specifics to make this image unique):
- Location: ${location}
- Subject: ${subject}
- Activity: ${activity}
- Lighting: ${lighting}
- Attire: ${styling}
- Composition: ${composition}
${topicContext}

CRITICAL Requirements:
- Professional lifestyle photography quality, sharp and beautifully composed
- Warm, caring, and reassuring emotional tone that feels genuine
- THE PERSON MUST BE WEARING A VISIBLE SOS/EMERGENCY PENDANT around their neck on a lanyard or elegant chain - this is MANDATORY
- The pendant should be a small, sleek, modern emergency device clearly visible in the shot
- DO NOT include any text, logos, watermarks, or overlays in the image
- Suitable for Facebook marketing (1200x630 landscape aspect ratio)
- Natural, authentic representation - the person should look real, not like a model
- Avoid clinical, hospital, or sterile settings entirely
- Focus on independence, dignity, joy, and vibrant living
- Use warm Mediterranean color palette (golden light, blue skies, terracotta tones, olive greens)
- Include environmental details that make the scene feel rich and lived-in
- The moment should feel candid and natural, not staged`;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { style, topic, image_text, post_id, post_text }: RequestBody = await req.json();

    if (!style) {
      return new Response(
        JSON.stringify({ error: "Style is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate "from_post_text" style requires post_text
    if (style === "from_post_text" && !post_text) {
      return new Response(
        JSON.stringify({ error: "Post text is required for 'Based on Post Text' style" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Initialize Supabase client to fetch company settings
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch company settings from database
    const { data: settingsData } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["settings_company_name", "settings_emergency_phone", "settings_support_email", "settings_address"]);

    const settingsMap = (settingsData || []).reduce((acc, setting) => {
      const normalizedKey = setting.key.replace(/^settings_/, '');
      acc[normalizedKey] = setting.value;
      return acc;
    }, {} as Record<string, string>);

    const company: CompanySettings = {
      company_name: settingsMap.company_name || DEFAULT_COMPANY_SETTINGS.company_name,
      emergency_phone: settingsMap.emergency_phone || DEFAULT_COMPANY_SETTINGS.emergency_phone,
      support_email: settingsMap.support_email || DEFAULT_COMPANY_SETTINGS.support_email,
      address: settingsMap.address || DEFAULT_COMPANY_SETTINGS.address
    };

    console.log("Using company settings:", company.company_name);

    const prompt = buildImagePrompt(style, company, topic, image_text, post_text);
    console.log("Generating image with style:", style);
    console.log("Prompt preview:", prompt.substring(0, 300) + "...");

    // Call Lovable AI Gateway with image model
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log("AI response received");

    // Extract the image from the response
    const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) {
      console.error("No image in AI response:", JSON.stringify(aiData).substring(0, 500));
      throw new Error("No image generated by AI");
    }

    // Extract base64 data (remove data:image/png;base64, prefix)
    const base64Match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      throw new Error("Invalid image data format");
    }

    const imageFormat = base64Match[1];
    const base64Data = base64Match[2];

    // Convert base64 to Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Upload to Supabase Storage (reuse supabase client from earlier)
    const fileName = `ai-generated-${Date.now()}-${style}.${imageFormat}`;
    const filePath = fileName;

    const { error: uploadError } = await supabase.storage
      .from("social-post-images")
      .upload(filePath, bytes, {
        contentType: `image/${imageFormat}`,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("social-post-images")
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;
    console.log("Image uploaded successfully:", publicUrl);

    // Optionally update the social post with the image
    if (post_id) {
      const { error: updateError } = await supabase
        .from("social_posts")
        .update({ image_url: publicUrl, updated_at: new Date().toISOString() })
        .eq("id", post_id);

      if (updateError) {
        console.warn("Failed to update post with image:", updateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        image_url: publicUrl,
        style,
        message: aiData.choices?.[0]?.message?.content || "Image generated successfully",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-ai-image error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Failed to generate image" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
