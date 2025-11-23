import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUserContext, formatContextForAI } from "../shared/context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExperimentOutput {
  title: string;
  description: string;
  steps: string[];
  duration: string;
  identity_shift_target: string;
  baseline_impact: number;
  content_fuel: number;
  identity_alignment: number;
}

function validateExperiments(data: any): ExperimentOutput[] {
  if (!data.experiments || !Array.isArray(data.experiments)) {
    throw new Error('Invalid experiments array');
  }
  
  data.experiments.forEach((exp: any) => {
    if (!exp.title || typeof exp.title !== 'string') throw new Error('Invalid experiment title');
    if (!exp.description || typeof exp.description !== 'string') throw new Error('Invalid experiment description');
    if (!exp.steps || !Array.isArray(exp.steps) || exp.steps.length < 2) throw new Error('Invalid experiment steps');
    if (!exp.duration || typeof exp.duration !== 'string') throw new Error('Invalid experiment duration');
    if (!exp.identity_shift_target || typeof exp.identity_shift_target !== 'string') throw new Error('Invalid identity_shift_target');
  });
  
  return data.experiments as ExperimentOutput[];
}

function getFallbackExperiments(): ExperimentOutput[] {
  return [
    {
      title: "5-Day High-Impact Job Sprint",
      description: "Apply to 50 highly-targeted roles in 5 days using AI-assisted applications. Focus on quality, speed, and immediate follow-up to generate interviews fast.",
      steps: [
        "Identify 10 perfect-fit roles daily (hospitality/SDR/remote)",
        "Use AI to customize each application in 5 minutes",
        "Send personalized follow-up within 24 hours of applying",
        "Document response rates and refine approach daily"
      ],
      duration: "5 days",
      identity_shift_target: "I am someone who creates opportunities rapidly through focused, intelligent action.",
      baseline_impact: 10,
      content_fuel: 7,
      identity_alignment: 9
    }
  ];
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

    console.log("Experiment generator called for user:", user.id);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Fetch user's context using shared helper
    const userContext = await fetchUserContext(supabase, user.id);
    const context = formatContextForAI(userContext);
    
    // Fetch phase
    const { data: identityData } = await supabase
      .from("identity_seeds")
      .select("current_phase, target_monthly_income, current_monthly_income")
      .eq("user_id", user.id)
      .maybeSingle();

    const phase = identityData?.current_phase || "baseline";
    const incomeGap = (identityData?.target_monthly_income || 4000) - (identityData?.current_monthly_income || 0);

    const systemPrompt = phase === "baseline"
      ? `You are an elite experiment designer. Design ONE exceptional experiment for a user in BASELINE PHASE.

BASELINE PHASE = Income gap: $${incomeGap}. Priority: Lock stable income FIRST.

YOUR JOB: Design the SINGLE BEST experiment for where they are RIGHT NOW.

EXPERIMENT QUALITY CRITERIA:
✓ High-leverage (maximum results, minimum time)
✓ Immediately actionable (can start today)
✓ Creates visible momentum (fast feedback loops)
✓ Generates content/proof (social validation)
✓ Aligns with their identity shift goals

Triple-Score System (0-10 each):
1. Baseline Impact: Does this generate income/offers THIS WEEK? (Must be 8+)
2. Content Fuel: Does this create 5+ pieces of content? (Must be 7+)
3. Identity Alignment: Does this prove their identity shift?

BASELINE EXPERIMENT TYPES (choose the most urgent):
- Job Application Sprint (if job_apps < goal)
- Income Generation Challenge (bartending, freelance, micro-projects)
- Network Activation (leverage existing connections for referrals/offers)
- Authority Building Sprint (create content that attracts opportunities)

EXPERIMENT STRUCTURE:
- Duration: 3-7 days MAX
- Steps: 3-4 concrete, repeatable daily actions
- Success metrics: Clear, measurable, fast

Design ONE experiment that will create the most momentum RIGHT NOW.`
      : `You are an elite experiment designer. Design ONE exceptional experiment for a user in EMPIRE PHASE.

EMPIRE PHASE = Baseline locked. Priority: Scale content, authority, and creative output.

YOUR JOB: Design the SINGLE BEST experiment for their growth stage.

EXPERIMENT QUALITY CRITERIA:
✓ Expands their authority/influence
✓ Tests a new content format or distribution channel
✓ Builds on existing strengths
✓ Creates reusable systems or frameworks
✓ Deepens identity alignment

Triple-Score System (0-10 each):
1. Baseline Impact: Does this maintain/grow income? (Must be 6+)
2. Content Fuel: Does this create 10+ pieces of content? (Must be 8+)
3. Identity Alignment: Does this prove their identity evolution? (Must be 8+)

EMPIRE EXPERIMENT TYPES (choose the highest leverage):
- Content System Sprint (daily creation challenge)
- Authority Building (thought leadership, frameworks)
- Audience Growth (engagement, community building)
- Product/Service Testing (validate new offerings)
- Creative Expression (presence, play, artistic output)

EXPERIMENT STRUCTURE:
- Duration: 5-14 days
- Steps: 3-4 daily actions that compound
- Success metrics: Quality + quantity

Design ONE experiment that will create the most growth RIGHT NOW.`;

    console.log("Fetched user context, calling AI gateway...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Context:\n${context}\n\nDesign the ONE BEST experiment for me right now. Make it exceptional.` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_experiments",
              description: "Generate ONE exceptional experiment suggestion",
              parameters: {
                type: "object",
                properties: {
                  experiments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Short, compelling experiment title" },
                        description: { type: "string", description: "What you're testing and why it matters now (2-3 sentences)" },
                        steps: { 
                          type: "array", 
                          items: { type: "string" }, 
                          description: "3-4 concrete, repeatable daily actions",
                          minItems: 3,
                          maxItems: 4
                        },
                        duration: { type: "string", description: "e.g., '5 days', '1 week'" },
                        identity_shift_target: { type: "string", description: "The identity shift this experiment proves (I am someone who...)" },
                        baseline_impact: { type: "integer", minimum: 0, maximum: 10, description: "Income/opportunity generation (0-10)" },
                        content_fuel: { type: "integer", minimum: 0, maximum: 10, description: "Content creation potential (0-10)" },
                        identity_alignment: { type: "integer", minimum: 0, maximum: 10, description: "Identity shift alignment (0-10)" }
                      },
                      required: ["title", "description", "steps", "duration", "identity_shift_target", "baseline_impact", "content_fuel", "identity_alignment"],
                      additionalProperties: false
                    },
                    minItems: 1,
                    maxItems: 1
                  }
                },
                required: ["experiments"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_experiments" } }
      }),
    });

    if (!response.ok) {
      console.error("AI Gateway error:", response.status, await response.text());
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
    console.log("AI response received, tool calls:", data.choices[0].message.tool_calls);
    const toolCall = data.choices[0].message.tool_calls?.[0];
    
    if (!toolCall) {
      console.error("No tool call in response, using fallback");
      return new Response(
        JSON.stringify({ experiments: getFallbackExperiments() }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let experiments;
    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      console.log("Parsed tool call arguments:", parsed);
      experiments = validateExperiments(parsed);
      console.log("Validated experiments:", experiments.length);
    } catch (parseError) {
      console.error("Failed to parse/validate AI response:", parseError);
      return new Response(
        JSON.stringify({ experiments: getFallbackExperiments() }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert experiments with triple scores
    for (const exp of experiments) {
      await supabase.from("experiments").insert({
        user_id: user.id,
        title: exp.title,
        description: exp.description,
        steps: exp.steps.join("\n"),
        duration: exp.duration,
        identity_shift_target: exp.identity_shift_target,
        status: "planning",
        baseline_impact: exp.baseline_impact,
        content_fuel: exp.content_fuel,
        identity_alignment: exp.identity_alignment
      });
    }

    return new Response(
      JSON.stringify({ experiments }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Experiment generator error:", error);
    return new Response(
      JSON.stringify({ experiments: getFallbackExperiments() }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
