import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PILLARS = ["Money","UPath","Sales","Content","Body","Charisma","Relationship","Friendship","Mind","Admin"];
const DAY_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

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

    const system = `You take a raw weekly plan and REVERSE-ENGINEER it into a Mon-Sun daily rhythm.

For each real commitment in the plan, output a per-day breakdown across all 7 days (Mon=0..Sun=6).
Some days should be heavier, some lighter — a real human week has rhythm, not a flat line.

Heuristics:
- Weekday grind (Sales, UPath outreach, Job apps, Content): weight Mon/Tue/Wed heavier, taper Thu/Fri, minimal or 0 on Sat/Sun.
- Body / workouts: 3-4x per week — pick specific days (e.g. Mon/Wed/Fri, or Tue/Thu/Sat), rest days = 0.
- Meals / daily habits (protein, sleep, hydration): consistent every day.
- Social / fun / friends / drumming / play: weight Fri/Sat/Sun, low or 0 on Mon-Thu.
- Admin / errands (apartment setup, laundry, curtains): 1-2 specific days, not spread out.
- One-shot tasks ("close Daniel", "order curtains"): pick ONE best day, 0 on all others.
- Honor day-specific mentions ("Tuesday gym" -> Tue only).
- Big pushes stated by user ("Mon-Wed heavy on outreach") get 1.3-1.5x weight those days.

For EACH commitment output:
- text: short imperative ("Apply to jobs", "UPath outreach", "Chest workout", "Order curtains", "Two big meals + 130g protein")
- pillar: one of ${PILLARS.join(", ")}
- unit: short noun ("applications", "outreaches", "session", "meals", "minutes")
- per_day: array of 7 integers, one per day Mon..Sun. Each = target count for that day. Use 0 for rest days. For binary items (workout done or not) use 1 or 0.
- one_shot: true if this is a single task done once this week (like "close Daniel"), false for recurring.

Rules:
- Prefer user's numbers. "20-30 outreaches/day" -> per_day sums to ~140-210, distribute heavier early week.
- If the user gives a weekly floor ("5-10 jobs/day, floor 33/week") aim per_day sum >= floor, weighted.
- Skip pure meta rules ("the goal is understanding..."). Collapse them into the parent item.
- Max 10 commitments. Fewer is better.
Return ONLY JSON.`;

    const schema = {
      type: "object",
      properties: {
        commitments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              pillar: { type: "string", enum: PILLARS },
              unit: { type: "string" },
              per_day: {
                type: "array",
                items: { type: "integer", minimum: 0 },
                minItems: 7,
                maxItems: 7,
              },
              one_shot: { type: "boolean" },
            },
            required: ["text", "pillar", "unit", "per_day", "one_shot"],
            additionalProperties: false,
          },
        },
      },
      required: ["commitments"],
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
    try { parsed = JSON.parse(content); } catch { parsed = { commitments: [] }; }

    // Flatten commitments into one intention per active day
    const intentions: Array<{ text: string; pillar: string | null; day_of_week: number | null }> = [];
    const commitments = (parsed.commitments || []).slice(0, 10);

    for (const c of commitments) {
      if (!c || typeof c.text !== "string" || !Array.isArray(c.per_day)) continue;
      const baseText = String(c.text).trim();
      const unit = (typeof c.unit === "string" && c.unit.trim()) ? c.unit.trim() : "session";
      const pillar = PILLARS.includes(c.pillar) ? c.pillar : null;
      const perDay: number[] = c.per_day.slice(0, 7).map((n: any) => Math.max(0, Number.isInteger(n) ? n : 0));
      const oneShot = !!c.one_shot;

      if (oneShot) {
        // Pick the single day with the highest value (or first non-zero)
        let dayIdx = perDay.findIndex((n) => n > 0);
        if (dayIdx < 0) dayIdx = 0;
        intentions.push({
          text: `${baseText} (${DAY_LABELS[dayIdx]})`,
          pillar,
          day_of_week: dayIdx,
        });
        continue;
      }

      // Recurring: one entry per active day, with the day's target inline
      for (let d = 0; d < 7; d++) {
        const target = perDay[d] || 0;
        if (target <= 0) continue;
        const suffix = target === 1 && (unit === "session" || unit === "task")
          ? ""
          : ` — ${target} ${unit}`;
        intentions.push({
          text: `${baseText}${suffix}`,
          pillar,
          day_of_week: d,
        });
      }
    }

    // Cap total to prevent flood
    const capped = intentions.slice(0, 40);

    return new Response(JSON.stringify({ intentions: capped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("parse-weekly-plan error", err);
    return new Response(JSON.stringify({ error: err?.message || "Failed" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
