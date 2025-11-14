import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Fetch user's context including Identity Seed
    const [identitySeed, insights, documents, experiments, topics] = await Promise.all([
      supabase.from("identity_seeds").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("insights").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
      supabase.from("documents").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(3),
      supabase.from("experiments").select("*").eq("user_id", user.id).eq("status", "in_progress").limit(3),
      supabase.from("topics").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    ]);

    const context = `
Identity Seed (North Star): ${identitySeed.data?.content || "Not set"}

Current State:
- Topics Learning: ${topics.data?.map(t => t.name).join(", ") || "None"}
- Recent Insights: ${insights.data?.map(i => i.title).join(", ") || "None"}
- Documents: ${documents.data?.map(d => d.title).join(", ") || "None"}
- Active Experiments: ${experiments.data?.map(e => e.title).join(", ") || "None"}
`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are guided by the user's Identity Seed. Suggest ONE simple action (≤45 min) aligned with their identity, experiments, and learning. Philosophy: proof > theory, experiments > plans, identity > productivity, ease > force. Return JSON with: one_thing, why_matters, how_to_start."
          },
          {
            role: "user",
            content: `Based on my Identity Seed and current context, what's my ONE thing for today?\n${context}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "choose_daily_action",
              description: "Choose one daily action",
              parameters: {
                type: "object",
                properties: {
                  one_thing: { type: "string" },
                  why_matters: { type: "string" },
                  how_to_start: { type: "string" }
                },
                required: ["one_thing", "why_matters", "how_to_start"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "choose_daily_action" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices[0].message.tool_calls?.[0];
    const action = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify(action),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Navigator error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});