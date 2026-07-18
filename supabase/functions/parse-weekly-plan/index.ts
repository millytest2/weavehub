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

    const system = `You take a raw weekly plan and reduce it to WEEK-LEVEL commitments.
Do NOT split into 7 per-day items. Do NOT create Mon/Tue/Wed variants. One line per real commitment.

For EACH commitment, extract the DAILY floor and DAILY stretch:
- daily_min = the minimum reps/units per day that still counts as "hit" (the floor).
- daily_max = the max reps/units per day the user could push to if it's easy (the stretch).
- unit = short noun for what's being counted ("applications", "outreaches", "minutes", "meals", "sessions", "posts", "words"). Use "session" for binary items (workout done or not) with min 1 max 1.
- cadence = "daily" (most items), "weekly" (a one-shot thing like "order curtains" — min 1 max 1, unit "task"), or "weekdays".

Rules:
- Prefer the user's own numbers. "20-30 outreaches" -> min 20, max 30, unit outreaches. "5-10 jobs" -> min 5, max 10. "45 minute chest workout" -> min 1 max 1 unit session.
- If only one number given ("2 big meals"), use it as both min and max (or set max slightly higher only if the plan implies a stretch).
- If no number at all, min=1 max=1 unit "session".
- Skip meta rules ("the goal is...", "understanding...", "weekly floor:") — collapse those into the parent commitment they modify instead of their own line.
- Keep text short and imperative: "Apply to jobs", "Outreach for UPath", "Chest workout", "Order curtains + rod", "Two big healthy meals + 130g protein".
- Assign one pillar from: ${PILLARS.join(", ")}.
- Max 12 commitments. Fewer is better.
Return ONLY JSON.`;

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
              daily_min: { type: "integer", minimum: 0 },
              daily_max: { type: "integer", minimum: 0 },
              unit: { type: "string" },
              cadence: { type: "string", enum: ["daily", "weekdays", "weekly"] },
            },
            required: ["text", "pillar", "daily_min", "daily_max", "unit", "cadence"],
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
      .slice(0, 12)
      .map((i: any) => {
        const min = Number.isInteger(i.daily_min) ? Math.max(0, i.daily_min) : 1;
        const maxRaw = Number.isInteger(i.daily_max) ? Math.max(min, i.daily_max) : min;
        const unit = (typeof i.unit === "string" && i.unit.trim()) ? i.unit.trim() : "session";
        const cadence = ["daily","weekdays","weekly"].includes(i.cadence) ? i.cadence : "daily";
        const suffix = cadence === "weekly"
          ? ` (one-shot this week)`
          : min === maxRaw
            ? ` (${min} ${unit}${cadence === "weekdays" ? "/weekday" : "/day"})`
            : ` (min ${min} · stretch ${maxRaw} ${unit}${cadence === "weekdays" ? "/weekday" : "/day"})`;
        return {
          text: `${String(i.text).trim()}${suffix}`,
          pillar: PILLARS.includes(i.pillar) ? i.pillar : null,
          day_of_week: null,
          daily_min: min,
          daily_max: maxRaw,
          unit,
          cadence,
        };
      });

    return new Response(JSON.stringify({ intentions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("parse-weekly-plan error", err);
    return new Response(JSON.stringify({ error: err?.message || "Failed" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
