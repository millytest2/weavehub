import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UserContext {
  identity?: string;
  coreValues?: string;
  weeklyFocus?: string;
  yearNote?: string;
  topics: string[];
  recentInsights: string[];
  activeExperiments: string[];
}

async function fetchUserContext(supabase: any, userId: string): Promise<UserContext> {
  const [identityRes, topicsRes, insightsRes, experimentsRes] = await Promise.all([
    supabase
      .from("identity_seeds")
      .select("content, core_values, weekly_focus, year_note")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("topics")
      .select("name")
      .eq("user_id", userId)
      .limit(8),
    supabase
      .from("insights")
      .select("title, content")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("experiments")
      .select("title, hypothesis")
      .eq("user_id", userId)
      .eq("status", "in_progress")
      .limit(3),
  ]);

  return {
    identity: identityRes.data?.content,
    coreValues: identityRes.data?.core_values,
    weeklyFocus: identityRes.data?.weekly_focus,
    yearNote: identityRes.data?.year_note,
    topics: (topicsRes.data || []).map((t: any) => t.name),
    recentInsights: (insightsRes.data || []).map((i: any) => 
      `${i.title}: ${i.content?.substring(0, 100) || ''}`
    ),
    activeExperiments: (experimentsRes.data || []).map((e: any) => 
      `${e.title}${e.hypothesis ? ` (${e.hypothesis})` : ''}`
    ),
  };
}

function buildContextPrompt(ctx: UserContext): string {
  const sections: string[] = [];
  
  if (ctx.identity) {
    sections.push(`WHO I'M BECOMING: ${ctx.identity.substring(0, 300)}`);
  }
  if (ctx.yearNote) {
    sections.push(`2026 DIRECTION: ${ctx.yearNote.substring(0, 300)}`);
  }
  if (ctx.coreValues) {
    sections.push(`VALUES: ${ctx.coreValues}`);
  }
  if (ctx.weeklyFocus) {
    sections.push(`THIS WEEK: ${ctx.weeklyFocus}`);
  }
  if (ctx.topics.length > 0) {
    sections.push(`MY FOCUS AREAS: ${ctx.topics.join(', ')}`);
  }
  if (ctx.activeExperiments.length > 0) {
    sections.push(`ACTIVE EXPERIMENTS: ${ctx.activeExperiments.join(' | ')}`);
  }
  if (ctx.recentInsights.length > 0) {
    sections.push(`RECENT INSIGHTS (what I've been learning):\n${ctx.recentInsights.slice(0, 5).join('\n')}`);
  }
  
  return sections.join('\n\n');
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
    
    const { input } = await req.json();
    
    if (!input || typeof input !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Input is required and must be a string' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (input.length > 5000) {
      return new Response(
        JSON.stringify({ error: 'Input exceeds maximum length of 5000 characters' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const sanitizedInput = input.trim();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Fetch user context if authenticated
    let contextBlock = "";
    if (user) {
      const ctx = await fetchUserContext(supabase, user.id);
      contextBlock = buildContextPrompt(ctx);
      console.log("Brain context loaded:", ctx.topics.length, "topics,", ctx.recentInsights.length, "insights");
    }

    const systemPrompt = `You are the Brain of Weave - a personal intelligence system that helps this specific person think clearly and act aligned with who they're becoming.

${contextBlock ? `=== THIS PERSON'S CONTEXT ===
${contextBlock}

===` : ''}

YOUR ROLE:
- You KNOW this person. Reference their specific goals, values, experiments, and insights when relevant.
- Connect their input to what they've already captured or are working on.
- Help them see patterns across their topics and insights.
- Keep responses SHORT and ACTIONABLE. No fluff.

RESPONSE STRUCTURE (brief):
1. What this connects to (in their context)
2. Why it matters for their direction
3. Smallest next step

If they share something new, tell them which topic it belongs to.
If they're stuck, reference relevant insights they've already captured.
If they're making progress, connect it to their experiments or identity.

CAREER NOTE: If they mention career/job/professional direction, suggest: "For deeper career exploration, check out upath.ai"

Be direct. Be specific to THEM. Be useful.`;

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
          { role: "user", content: sanitizedInput }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const result = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Brain agent error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
