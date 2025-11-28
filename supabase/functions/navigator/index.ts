import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatContextForAI } from "../shared/context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALL_PILLARS = ["Stability", "Skill", "Content", "Health", "Presence", "Admin", "Connection", "Learning"];

interface NavigatorOutput {
  priority_for_today: string;
  do_this_now: string;
  why_it_matters: string;
  time_required: string;
}

function validateNavigatorOutput(data: any): NavigatorOutput {
  if (!data.priority_for_today || typeof data.priority_for_today !== 'string') throw new Error('Invalid priority_for_today');
  if (!data.do_this_now || typeof data.do_this_now !== 'string') throw new Error('Invalid do_this_now');
  if (!data.why_it_matters || typeof data.why_it_matters !== 'string') throw new Error('Invalid why_it_matters');
  if (!data.time_required || typeof data.time_required !== 'string') throw new Error('Invalid time_required');
  return data as NavigatorOutput;
}

function getFallbackSuggestion(pillar: string): NavigatorOutput {
  const fallbacks: { [key: string]: NavigatorOutput } = {
    "Skill": {
      priority_for_today: "Skill",
      do_this_now: "Spend 30 minutes building something visible.",
      why_it_matters: "Small progress compounds. Ship something small.",
      time_required: "30 minutes"
    },
    "Content": {
      priority_for_today: "Content",
      do_this_now: "Write and share one authentic insight.",
      why_it_matters: "Building in public attracts opportunity.",
      time_required: "20 minutes"
    },
    "Health": {
      priority_for_today: "Health",
      do_this_now: "Move your body for 20 minutes.",
      why_it_matters: "Physical energy creates mental clarity.",
      time_required: "20 minutes"
    },
    "Presence": {
      priority_for_today: "Presence",
      do_this_now: "5 minutes of nervous system regulation.",
      why_it_matters: "Calm creates clarity.",
      time_required: "10 minutes"
    },
    "Stability": {
      priority_for_today: "Stability",
      do_this_now: "Take one action toward income.",
      why_it_matters: "Stability creates freedom.",
      time_required: "30 minutes"
    },
    "Admin": {
      priority_for_today: "Admin",
      do_this_now: "Clear one thing from your backlog.",
      why_it_matters: "Friction drains energy.",
      time_required: "15 minutes"
    },
    "Connection": {
      priority_for_today: "Connection",
      do_this_now: "Reach out to one person.",
      why_it_matters: "Connection compounds.",
      time_required: "10 minutes"
    },
    "Learning": {
      priority_for_today: "Learning",
      do_this_now: "25 minutes of focused learning.",
      why_it_matters: "Learn to apply, not to know.",
      time_required: "25 minutes"
    }
  };
  return fallbacks[pillar] || fallbacks["Skill"];
}

function choosePillar(recentPillars: string[]): string {
  const last3 = recentPillars.slice(0, 3);
  
  // Never same pillar 3x in a row
  if (last3.length >= 2 && last3[0] === last3[1]) {
    const available = ALL_PILLARS.filter(p => p !== last3[0]);
    return available[Math.floor(Math.random() * available.length)];
  }
  
  // Prefer unused pillars
  const pillarCounts: { [key: string]: number } = {};
  ALL_PILLARS.forEach(p => pillarCounts[p] = 0);
  last3.forEach(p => { if (pillarCounts[p] !== undefined) pillarCounts[p]++; });
  
  const unused = ALL_PILLARS.filter(p => pillarCounts[p] === 0);
  if (unused.length > 0) {
    return unused[Math.floor(Math.random() * unused.length)];
  }
  
  const available = ALL_PILLARS.filter(p => p !== last3[0]);
  return available[Math.floor(Math.random() * available.length)];
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

    const userContext = await fetchUserContext(supabase, user.id);
    
    const { data: identityData } = await supabase
      .from("identity_seeds")
      .select("last_pillar_used")
      .eq("user_id", user.id)
      .maybeSingle();

    const lastPillar = identityData?.last_pillar_used || null;
    const recentPillars = [
      ...(lastPillar ? [lastPillar] : []),
      ...userContext.pillar_history
    ];

    const suggestedPillar = choosePillar(recentPillars);
    console.log(`Navigator: ${suggestedPillar}`);

    const contextPrompt = formatContextForAI(userContext);

    const systemPrompt = `You are a personal operating system. Return ONE action.

${contextPrompt}

CORE QUESTION: What action today reinforces the user's identity shift?

PILLAR FOR THIS ACTION: ${suggestedPillar}

PILLARS:
- Stability: Income, job, cash flow
- Skill: Building, shipping, projects
- Content: Creating, posting, sharing
- Health: Movement, nutrition, energy
- Presence: Emotional regulation, confidence
- Admin: Organization, clearing blockers
- Connection: Social, relationships
- Learning: Education, skill acquisition

RULES:
- 15-45 minutes
- Clear and actionable
- Identity-aligned (not just productive)
- Fun, not homework
- No emojis
- No multiple options
- No over-explaining`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Give me ONE "${suggestedPillar}" action.` }
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
                  do_this_now: { type: "string", description: "One clear action, 15-45 minutes, no emojis" },
                  why_it_matters: { type: "string", description: "1-2 sentences max, no emojis" },
                  time_required: { type: "string" }
                },
                required: ["priority_for_today", "do_this_now", "why_it_matters", "time_required"]
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
      return new Response(JSON.stringify(getFallbackSuggestion(suggestedPillar)), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let action;
    try {
      action = JSON.parse(toolCall.function.arguments);
      action = validateNavigatorOutput(action);
      
      await supabase
        .from("identity_seeds")
        .update({ last_pillar_used: action.priority_for_today })
        .eq("user_id", user.id);
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
