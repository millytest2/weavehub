import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatContextForAI } from "../shared/context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ALL PILLARS - expanded for balance
const ALL_PILLARS = ["Stability", "Skill", "Content", "Health", "Presence", "Admin", "Dating", "Learning"];

interface NavigatorOutput {
  priority_for_today: string;
  do_this_now: string;
  why_it_matters: string;
  time_required: string;
  what_to_do_after: string;
}

function validateNavigatorOutput(data: any): NavigatorOutput {
  if (!data.priority_for_today || typeof data.priority_for_today !== 'string') throw new Error('Invalid priority_for_today');
  if (!data.do_this_now || typeof data.do_this_now !== 'string') throw new Error('Invalid do_this_now');
  if (!data.why_it_matters || typeof data.why_it_matters !== 'string') throw new Error('Invalid why_it_matters');
  if (!data.time_required || typeof data.time_required !== 'string') throw new Error('Invalid time_required');
  if (!data.what_to_do_after || typeof data.what_to_do_after !== 'string') throw new Error('Invalid what_to_do_after');
  return data as NavigatorOutput;
}

function getFallbackSuggestion(pillar: string): NavigatorOutput {
  const fallbacks: { [key: string]: NavigatorOutput } = {
    "Skill": {
      priority_for_today: "Skill",
      do_this_now: "Spend 30 minutes progressing your most important project or learning path.",
      why_it_matters: "Small, consistent progress compounds. Ship something small today.",
      time_required: "30 minutes",
      what_to_do_after: "Mark complete and I'll give you the next action."
    },
    "Content": {
      priority_for_today: "Content",
      do_this_now: "Write and post one authentic insight about something you learned recently.",
      why_it_matters: "Building in public attracts opportunity. Your story matters.",
      time_required: "20 minutes",
      what_to_do_after: "Engage with 3 people who respond, then return here."
    },
    "Health": {
      priority_for_today: "Health",
      do_this_now: "Move your body for 20 minutes - walk, stretch, workout, anything.",
      why_it_matters: "Physical energy creates mental clarity. Your body is your operating system.",
      time_required: "20 minutes",
      what_to_do_after: "Hydrate, then tackle your next task with fresh energy."
    },
    "Presence": {
      priority_for_today: "Presence",
      do_this_now: "Do 5 minutes of nervous system regulation (breathwork, cold exposure, meditation).",
      why_it_matters: "Calm creates clarity. Regulate before you act.",
      time_required: "10 minutes",
      what_to_do_after: "Journal one thing you're avoiding, then face it."
    },
    "Stability": {
      priority_for_today: "Stability",
      do_this_now: "Take one concrete action toward income: apply, reach out, or follow up.",
      why_it_matters: "Stability creates freedom. One action reduces anxiety.",
      time_required: "30 minutes",
      what_to_do_after: "Log it and move to a non-Stability pillar."
    },
    "Admin": {
      priority_for_today: "Admin",
      do_this_now: "Clear one thing from your mental backlog (email, task, decision).",
      why_it_matters: "Friction drains energy. Remove one blocker.",
      time_required: "15 minutes",
      what_to_do_after: "Celebrate the clear space, then pick your next action."
    },
    "Dating": {
      priority_for_today: "Dating",
      do_this_now: "Reach out to one person - text a friend, start a conversation, make a plan.",
      why_it_matters: "Connection compounds. One reach-out opens doors.",
      time_required: "10 minutes",
      what_to_do_after: "Follow through on the next step of that connection."
    },
    "Learning": {
      priority_for_today: "Learning",
      do_this_now: "Spend 25 minutes learning something specific you need for your current project.",
      why_it_matters: "Targeted learning accelerates everything. Learn to apply, not to know.",
      time_required: "25 minutes",
      what_to_do_after: "Apply what you just learned immediately."
    }
  };
  return fallbacks[pillar] || fallbacks["Skill"];
}

// Choose pillar with rotation enforcement
function choosePillarForRotation(recentPillars: string[], phase: string, isInCrisis: boolean): string {
  const last3 = recentPillars.slice(0, 3);
  
  // HARD RULE: Never do same pillar 3x in a row
  if (last3.length >= 2 && last3[0] === last3[1]) {
    const forcedAway = ALL_PILLARS.filter(p => p !== last3[0]);
    return forcedAway[Math.floor(Math.random() * forcedAway.length)];
  }
  
  // HARD RULE: Never do Stability more than 2x in a row (unless crisis)
  if (!isInCrisis && last3.slice(0, 2).every(p => p === "Stability")) {
    return ALL_PILLARS.filter(p => p !== "Stability")[Math.floor(Math.random() * (ALL_PILLARS.length - 1))];
  }
  
  // Find underused pillars
  const pillarCounts: { [key: string]: number } = {};
  ALL_PILLARS.forEach(p => pillarCounts[p] = 0);
  last3.forEach(p => { if (pillarCounts[p] !== undefined) pillarCounts[p]++; });
  
  // Prefer pillars not used recently
  const unused = ALL_PILLARS.filter(p => pillarCounts[p] === 0);
  if (unused.length > 0) {
    // Weight by phase
    if (phase === "baseline") {
      const preferred = unused.filter(p => ["Stability", "Skill", "Content", "Health"].includes(p));
      if (preferred.length > 0) return preferred[Math.floor(Math.random() * preferred.length)];
    } else {
      const preferred = unused.filter(p => ["Skill", "Content", "Presence", "Learning", "Dating"].includes(p));
      if (preferred.length > 0) return preferred[Math.floor(Math.random() * preferred.length)];
    }
    return unused[Math.floor(Math.random() * unused.length)];
  }
  
  // If all used, avoid most recent
  const avoidRecent = ALL_PILLARS.filter(p => p !== last3[0]);
  return avoidRecent[Math.floor(Math.random() * avoidRecent.length)];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Fetch context
    const userContext = await fetchUserContext(supabase, user.id);
    
    // Get phase and income
    const { data: identityData } = await supabase
      .from("identity_seeds")
      .select("current_phase, current_monthly_income, last_pillar_used")
      .eq("user_id", user.id)
      .maybeSingle();

    const phase = identityData?.current_phase || "baseline";
    const currentIncome = identityData?.current_monthly_income || 0;
    const lastPillar = identityData?.last_pillar_used || null;
    const isInCrisis = phase === "baseline" && currentIncome === 0;

    // Get recent pillars for rotation
    const recentPillars = [
      ...(lastPillar ? [lastPillar] : []),
      ...userContext.pillar_history
    ];

    // Choose pillar with rotation logic
    const suggestedPillar = choosePillarForRotation(recentPillars, phase, isInCrisis);
    console.log(`Navigator suggesting pillar: ${suggestedPillar} (recent: ${recentPillars.slice(0, 3).join(', ')})`);

    const contextPrompt = formatContextForAI(userContext);

    const systemPrompt = `You are a personal operating system. Return ONE clear action.

${contextPrompt}

PHASE: ${phase.toUpperCase()}
${isInCrisis ? "⚠️ BASELINE CRISIS (zero income) - still rotate pillars" : ""}

PILLAR FOR THIS ACTION: ${suggestedPillar}
You MUST choose "${suggestedPillar}" as the priority_for_today.

WEIGHTING (how to process context):
• Insights (30%): Emotional/behavioral signals - weight HIGH
• Experiments (30%): Identity shifts - weight HIGH  
• Identity Seed (20%): Long-term compass only - NOT daily priority
• Daily Tasks (10%): Momentum patterns
• Documents (10%): Reference only - weight LOW

PILLAR DEFINITIONS:
• Stability: Income, job search, cash flow
• Skill: Building, shipping, UPath, projects
• Content: Creating, posting, communication
• Health: Movement, nutrition, energy
• Presence: Emotional regulation, identity, confidence
• Admin: Organization, clearing blockers
• Dating: Social, relationships, connection
• Learning: Education, courses, skill acquisition

ACTION RULES:
• 15-45 minutes (REQUIRED)
• Clear and frictionless
• Identity-aligned
• FUN, not homework
• Grounded in today's pillar

NEVER:
• Give job actions 3 days in a row (check recent pillars)
• Give multiple options
• Give vague suggestions
• Over-explain`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash", // Faster model
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Give me ONE "${suggestedPillar}" action for today.` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "choose_daily_action",
              description: "Return one clear action",
              parameters: {
                type: "object",
                properties: {
                  priority_for_today: { type: "string", enum: ALL_PILLARS },
                  do_this_now: { type: "string", description: "One clear action, 15-45 minutes" },
                  why_it_matters: { type: "string", description: "2-3 sentences max" },
                  time_required: { type: "string" },
                  what_to_do_after: { type: "string" }
                },
                required: ["priority_for_today", "do_this_now", "why_it_matters", "time_required", "what_to_do_after"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "choose_daily_action" } }
      }),
    });

    if (!response.ok) {
      console.error("AI Gateway error:", response.status);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Payment required." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify(getFallbackSuggestion(suggestedPillar)), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const toolCall = data.choices[0].message.tool_calls?.[0];
    
    if (!toolCall) {
      console.error("No tool call, using fallback");
      return new Response(JSON.stringify(getFallbackSuggestion(suggestedPillar)), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let action;
    try {
      action = JSON.parse(toolCall.function.arguments);
      action = validateNavigatorOutput(action);
      
      // Update last_pillar_used
      await supabase
        .from("identity_seeds")
        .update({ last_pillar_used: action.priority_for_today })
        .eq("user_id", user.id);
        
      console.log(`Navigator chose: ${action.priority_for_today}`);
    } catch (parseError) {
      console.error("Parse error:", parseError);
      return new Response(JSON.stringify(getFallbackSuggestion(suggestedPillar)), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(action), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Navigator error:", error);
    return new Response(JSON.stringify(getFallbackSuggestion("Skill")), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
