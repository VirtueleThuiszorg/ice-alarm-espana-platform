import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";



interface Goal { id: string; name: string; }
interface Audience { id: string; name: string; }
interface Topic { id: string; name: string; goal_ids?: string[]; }
interface ImageStyle { id: string; name: string; }

interface PlanRequest {
  start_date: string;
  end_date: string;
  posts_per_day: number;
  active_days: { mon: boolean; tue: boolean; wed: boolean; thu: boolean; fri: boolean; sat: boolean; sun: boolean };
  anti_repetition_rules: {
    goal_hours: number;
    audience_hours: number;
    topic_days: number;
    no_consecutive_style: boolean;
  };
  goals: Goal[];
  audiences: Audience[];
  topics: Topic[];
  image_styles: ImageStyle[];
}

interface PlannedSlot {
  scheduled_date: string;
  scheduled_time: string;
  goal_id: string | null;
  audience_id: string | null;
  topic_id: string | null;
  image_style_id: string | null;
  social_post_id: string | null;
  notes: string | null;
  status: "planned";
}

// Day name to index mapping
const DAY_MAP: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6
};

function getDayKey(date: Date): string {
  const day = date.getDay();
  return Object.keys(DAY_MAP).find(k => DAY_MAP[k] === day) || "mon";
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function diffHours(d1: Date, d2: Date): number {
  return Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60);
}

function diffDays(d1: Date, d2: Date): number {
  return Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24);
}

// Shuffle array for randomization
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      start_date,
      end_date,
      posts_per_day,
      active_days,
      anti_repetition_rules,
      goals,
      audiences,
      topics,
      image_styles,
    }: PlanRequest = await req.json();

    console.log("Generating content plan:", { start_date, end_date, posts_per_day });

    const plan: PlannedSlot[] = [];
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    // Track last usage for anti-repetition
    const lastGoalUsage: Map<string, Date> = new Map();
    const lastAudienceUsage: Map<string, Date> = new Map();
    const lastTopicUsage: Map<string, Date> = new Map();
    let lastStyleId: string | null = null;

    // Post times based on posts_per_day
    const postTimes = posts_per_day === 1 
      ? ["10:00:00"] 
      : posts_per_day === 2 
        ? ["09:00:00", "17:00:00"]
        : ["09:00:00", "13:00:00", "18:00:00"];

    // Iterate through each day
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayKey = getDayKey(currentDate);
      
      // Check if this day is active
      if (active_days[dayKey as keyof typeof active_days]) {
        for (let postIndex = 0; postIndex < posts_per_day; postIndex++) {
          const slotTime = new Date(currentDate);
          const [hours] = postTimes[postIndex].split(":");
          slotTime.setHours(parseInt(hours), 0, 0, 0);

          // Find valid goal (respecting cooldown)
          const validGoals = shuffle(goals).filter(g => {
            const lastUsed = lastGoalUsage.get(g.id);
            if (!lastUsed) return true;
            return diffHours(slotTime, lastUsed) >= anti_repetition_rules.goal_hours;
          });

          // Find valid audience (respecting cooldown)
          const validAudiences = shuffle(audiences).filter(a => {
            const lastUsed = lastAudienceUsage.get(a.id);
            if (!lastUsed) return true;
            return diffHours(slotTime, lastUsed) >= anti_repetition_rules.audience_hours;
          });

          // Find valid topic (respecting cooldown)
          const validTopics = shuffle(topics).filter(t => {
            const lastUsed = lastTopicUsage.get(t.id);
            if (!lastUsed) return true;
            return diffDays(slotTime, lastUsed) >= anti_repetition_rules.topic_days;
          });

          // Find valid style (no consecutive)
          let validStyles = shuffle(image_styles);
          if (anti_repetition_rules.no_consecutive_style && lastStyleId) {
            validStyles = validStyles.filter(s => s.id !== lastStyleId);
          }

          // Select items (fallback to any if all on cooldown)
          const selectedGoal = validGoals[0] || goals[Math.floor(Math.random() * goals.length)];
          const selectedAudience = validAudiences[0] || audiences[Math.floor(Math.random() * audiences.length)];
          
          // For topics, prefer ones linked to the selected goal
          let selectedTopic: Topic | null = null;
          if (validTopics.length > 0) {
            const goalLinkedTopics = validTopics.filter(t => t.goal_ids?.includes(selectedGoal?.id));
            selectedTopic = goalLinkedTopics[0] || validTopics[0];
          } else if (topics.length > 0) {
            selectedTopic = topics[Math.floor(Math.random() * topics.length)];
          }

          const selectedStyle = validStyles[0] || image_styles[Math.floor(Math.random() * image_styles.length)];

          // Create slot
          plan.push({
            scheduled_date: currentDate.toISOString().split("T")[0],
            scheduled_time: postTimes[postIndex],
            goal_id: selectedGoal?.id || null,
            audience_id: selectedAudience?.id || null,
            topic_id: selectedTopic?.id || null,
            image_style_id: selectedStyle?.id || null,
            social_post_id: null,
            notes: null,
            status: "planned",
          });

          // Update tracking
          if (selectedGoal) lastGoalUsage.set(selectedGoal.id, slotTime);
          if (selectedAudience) lastAudienceUsage.set(selectedAudience.id, slotTime);
          if (selectedTopic) lastTopicUsage.set(selectedTopic.id, slotTime);
          if (selectedStyle) lastStyleId = selectedStyle.id;
        }
      }

      currentDate = addDays(currentDate, 1);
    }

    console.log(`Generated ${plan.length} planned slots`);

    return new Response(
      JSON.stringify({ success: true, plan }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Content plan generation error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
