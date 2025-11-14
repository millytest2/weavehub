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
      supabase.from("experiments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(3),
      supabase.from("topics").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    ]);

    const context = `
Identity Seed (North Star): ${identitySeed.data?.content || "Not set"}

Current State:
- Topics: ${topics.data?.map(t => t.name).join(", ") || "None"}
- Recent Insights: ${insights.data?.map(i => i.title).join(", ") || "None"}
- Documents: ${documents.data?.map(d => d.title).join(", ") || "None"}
- Active Experiments: ${experiments.data?.filter((e: any) => e.status === 'in_progress').map((e: any) => e.title).join(", ") || "None"}
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
            content: `You are a direction synthesizer. Look at the user's Identity Seed and current state, then return ONE clear direction.

Return a JSON object with this exact structure:
{
  "headline": "Short direction phrase (5-8 words)",
  "summary": "2-4 sentence explanation of how things connect",
  "recommended_topic_id": null,
  "recommended_experiment_id": null,
  "suggested_next_step": "One concrete next step"
}

Philosophy: proof > theory, experiments > plans, identity > productivity, ease > force, simplicity > complexity.`
          },
          {
            role: "user",
            content: `Based on my Identity Seed and current context, suggest ONE clear direction:\n${context}`
          }
        ],
        response_format: { type: "json_object" }
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
    const resultText = data.choices[0].message.content;
    const result = JSON.parse(resultText);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Synthesizer error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});