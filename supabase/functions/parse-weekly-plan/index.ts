import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PILLARS = ["Money","UPath","Sales","Content","Body","Charisma","Relationship","Friendship","Mind","Admin"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader! } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { text } = await req.json().catch(() => ({ text: "" }));
    if (!text || typeof text !== "string" || text.length < 10) {
      return new Response(JSON.stringify({ error: "Provide a weekly plan text" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const system = `You break a user's raw weekly plan into structured, atomic, actionable weekly intentions.

Rules:
- Split every commitment, target, floor/stretch goal, and required sub-item into its OWN intention.
- Keep the original phrasing; be terse. No fluff, no therapy-speak.
- If a line mentions a specific weekday (Monday..Sunday), set day_of_week (0=Mon..6=Sun). Otherwise null.
- Assign one pillar from: ${PILLARS.join(", ")}. Match by meaning (Sales=outreach/calls/applications, UPath=product/research/positioning, Body=workouts/movement, Relationship=girlfriend/partner, Friendship=friends/family, Mind=journal/read/phone-off, Admin=logistics/apartment/moving/wifi, Money=income/payments, Content=posts/blog/video).
- For numeric targets ("5-10 calls", "weekly floor: 20", "4 movement sessions") keep the number in the text.
- If a section header exists (e.g. "Job Search", "Body"), prepend it as a short tag in the text like "Job Search: apply to 5-10 jobs today" only when it adds clarity; otherwise omit.
- Return ONLY JSON. Max 40 intentions.`;

    const schema = {
      type: "object",
      properties: {
        intentions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              pillar: { type: "string", enum: PILLARS },
              day_of_week: { type: ["integer", "null"], minimum: 0, maximum: 6 },
            },
            required: ["text", "pillar", "day_of_week"],
            additionalProperties: false,
          },
        },
      },
      required: ["intentions"],
      additionalProperties: false,
    };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: text.slice(0, 8000) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "weekly_plan", strict: true, schema },
        },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("AI gateway error", resp.status, errText);
      return new Response(JSON.stringify({ error: "AI unavailable, try again" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = { intentions: [] }; }

    const intentions = (parsed.intentions || [])
      .filter((i: any) => i && typeof i.text === "string" && i.text.trim().length > 2)
      .slice(0, 40)
      .map((i: any) => ({
        text: String(i.text).trim(),
        pillar: PILLARS.includes(i.pillar) ? i.pillar : null,
        day_of_week: Number.isInteger(i.day_of_week) && i.day_of_week >= 0 && i.day_of_week <= 6 ? i.day_of_week : null,
      }));

    return new Response(JSON.stringify({ intentions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("parse-weekly-plan error", err);
    return new Response(JSON.stringify({ error: err?.message || "Failed" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
