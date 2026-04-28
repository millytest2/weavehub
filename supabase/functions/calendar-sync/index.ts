import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

interface CalEvent {
  id: string;
  summary: string;
  start: string; // ISO
  end: string;
  all_day: boolean;
  location?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth! } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const body = await req.json().catch(() => ({}));
    const tz = body.timezone || "America/Los_Angeles";

    // Compute today's window in user's local tz
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    const todayStr = fmt.format(now);
    const startISO = new Date(`${todayStr}T00:00:00`).toISOString();
    const endISO = new Date(new Date(`${todayStr}T00:00:00`).getTime() + 36 * 3600 * 1000).toISOString();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GCAL_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY");

    if (!LOVABLE_API_KEY || !GCAL_KEY) {
      return new Response(JSON.stringify({ error: "Calendar not connected", events: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `${GATEWAY_URL}/calendars/primary/events?timeMin=${encodeURIComponent(startISO)}&timeMax=${encodeURIComponent(endISO)}&singleEvents=true&orderBy=startTime&maxResults=25`;

    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GCAL_KEY,
      },
    });

    if (!r.ok) {
      const t = await r.text();
      console.error("gcal error", r.status, t);
      return new Response(JSON.stringify({ error: "Calendar fetch failed", events: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    const events: CalEvent[] = (data.items || []).map((e: any) => ({
      id: e.id,
      summary: e.summary || "(untitled)",
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      all_day: !!e.start?.date,
      location: e.location,
    }));

    // Cache in DB
    await supabase.from("calendar_settings").upsert({
      user_id: user.id,
      cached_events: events,
      cache_date: todayStr,
      last_synced_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    return new Response(JSON.stringify({ events, date: todayStr }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("calendar-sync error", e);
    return new Response(JSON.stringify({ error: e.message, events: [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
