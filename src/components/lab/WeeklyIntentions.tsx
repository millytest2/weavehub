import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Check,
  Circle,
  X,
  ListTodo,
  Mic,
  MicOff,
  Sparkles,
  Loader2,
  Wand2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { getWeek, getYear, startOfWeek, addDays, format, isSameDay } from "date-fns";
import { useVoiceCaptureWebSpeech } from "@/hooks/useVoiceCaptureWebSpeech";

interface Intention {
  id: string;
  text: string;
  pillar: string | null;
  completed: boolean;
  sort_order: number;
  day_of_week: number | null;
}

// Miles's real skill-stack pillars (from identity + skill_stack table)
const PILLAR_COLORS: Record<string, string> = {
  Money: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  UPath: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  Sales: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Content: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  Body: "bg-green-500/15 text-green-600 dark:text-green-400",
  Charisma: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  Relationship: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  Friendship: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  Mind: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  Admin: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
};

const PILLAR_KEYWORDS: Record<string, string[]> = {
  Money: ["money", "income", "rent", "bills", "budget", "invoice", "close", "pay", "cash", "3k", "$", "revenue", "sale", "client"],
  UPath: ["upath", "product", "ship", "build", "deploy", "founder", "startup", "feature", "landing"],
  Sales: ["outreach", "dm", "cold", "pitch", "call", "prospect", "lead", "follow up", "book", "demo", "interview"],
  Content: ["post", "write", "video", "tiktok", "youtube", "tweet", "thread", "newsletter", "substack", "blog", "publish", "edit", "record", "share", "draft", "content", "reads"],
  Body: ["gym", "workout", "run", "walk", "sleep", "eat", "cook", "meal", "stretch", "yoga", "exercise", "water", "fast", "weight", "body", "lift", "cardio"],
  Charisma: ["speak", "voice", "presence", "eye contact", "story", "charisma", "presentation", "stage"],
  Relationship: ["girlfriend", "partner", "her", "date", "relationship", "romantic"],
  Friendship: ["friend", "hang", "coffee", "meet up", "text", "call friend", "brother", "sister", "family"],
  Mind: ["journal", "reflect", "breathe", "ground", "meditat", "mindful", "gratitude", "read", "book", "study", "notes", "let go", "evening"],
  Admin: ["clean", "organize", "email", "inbox", "errands", "laundry", "dishes", "appointment", "schedule", "tax", "paperwork", "cancel"],
};

function detectPillar(text: string): string | null {
  const lower = text.toLowerCase();
  let bestPillar: string | null = null;
  let bestScore = 0;
  for (const [pillar, keywords] of Object.entries(PILLAR_KEYWORDS)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestPillar = pillar;
    }
  }
  return bestPillar;
}

function splitCompoundEntry(text: string): string[] {
  const parts = text
    .split(/\s+and\s+|\s*,\s+|\s*\+\s+/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 3);
  if (parts.length > 1 && parts.every((p) => p.split(/\s+/).length >= 2)) return parts;
  return [text];
}

export function WeeklyIntentions() {
  const { user } = useAuth();
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [newText, setNewText] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null); // 0=Mon..6=Sun, null=any
  const [showPlanPaste, setShowPlanPaste] = useState(false);
  const [planText, setPlanText] = useState("");
  const [parsingPlan, setParsingPlan] = useState(false);
  const [identityContext, setIdentityContext] = useState<{
    coreValues: string | null;
    yearNote: string | null;
    lifeDomains: string | null;
  } | null>(null);

  const weekNumber = getWeek(new Date(), { weekStartsOn: 1 });
  const year = getYear(new Date());
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const today = new Date();

  const { isRecording, toggleRecording, isSupported } = useVoiceCaptureWebSpeech({
    maxDuration: 30,
    onTranscript: (text) => setNewText(text),
  });

  useEffect(() => {
    if (user) {
      fetchIntentions();
      fetchIdentityContext();
    }
  }, [user]);

  // Auto-check items whose meaning shows up in the last 7 days of completions/captures.
  useEffect(() => {
    if (!user || loading || intentions.length === 0) return;
    autoCheckFromActivity(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, intentions.length]);

  const fetchIdentityContext = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("identity_seeds")
      .select("core_values, year_note, life_domains")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setIdentityContext({
        coreValues: data.core_values,
        yearNote: data.year_note,
        lifeDomains: data.life_domains,
      });
    }
  };

  const fetchIntentions = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("weekly_intentions")
        .select("*")
        .eq("user_id", user.id)
        .eq("week_number", weekNumber)
        .eq("year", year)
        .order("sort_order", { ascending: true });
      setIntentions((data as any) || []);
    } catch (err) {
      console.error("Error fetching intentions:", err);
    } finally {
      setLoading(false);
    }
  };

  const addIntention = async () => {
    if (!user || !newText.trim()) return;
    setAdding(true);
    try {
      const entries = splitCompoundEntry(newText.trim());
      const inserts = entries.map((entry, i) => ({
        user_id: user.id,
        text: entry,
        week_number: weekNumber,
        year,
        sort_order: intentions.length + i,
        pillar: detectPillar(entry),
        day_of_week: selectedDay,
      }));
      const { error } = await supabase.from("weekly_intentions").insert(inserts as any);
      if (error) throw error;
      if (entries.length > 1) toast.success(`Split into ${entries.length} items`);
      setNewText("");
      fetchIntentions();
    } catch (err) {
      console.error("Error adding intention:", err);
      toast.error("Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const handleSuggest = async () => {
    if (!user || suggesting) return;
    setSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("daily-suggestions", {
        body: { type: "weekly-intentions" },
      });
      if (error) throw error;
      if (data?.suggestions && Array.isArray(data.suggestions)) {
        const inserts = data.suggestions.map((s: any, i: number) => ({
          user_id: user.id,
          text: s.text || s,
          week_number: weekNumber,
          year,
          sort_order: intentions.length + i,
          pillar: s.pillar || detectPillar(s.text || s),
          day_of_week: null,
        }));
        const { error: insertError } = await supabase.from("weekly_intentions").insert(inserts as any);
        if (insertError) throw insertError;
        toast.success(`Added ${inserts.length} suggestions`);
        fetchIntentions();
      }
    } catch (err: any) {
      console.error("Suggest error:", err);
      toast.error(err.message || "Failed to suggest");
    } finally {
      setSuggesting(false);
    }
  };

  const parsePlan = async () => {
    if (!user || !planText.trim() || parsingPlan) return;
    setParsingPlan(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-weekly-plan", {
        body: { text: planText.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const parsed: Array<{ text: string; pillar: string | null; day_of_week: number | null }> =
        data?.intentions || [];
      if (parsed.length === 0) {
        toast.error("Couldn't break that down — try again");
        return;
      }
      const inserts = parsed.map((p, i) => ({
        user_id: user.id,
        text: p.text,
        week_number: weekNumber,
        year,
        sort_order: intentions.length + i,
        pillar: p.pillar || detectPillar(p.text),
        day_of_week: p.day_of_week,
      }));
      const { error: insErr } = await supabase.from("weekly_intentions").insert(inserts as any);
      if (insErr) throw insErr;
      toast.success(`Broke plan into ${inserts.length} items`);
      setPlanText("");
      setShowPlanPaste(false);
      fetchIntentions();
    } catch (err: any) {
      console.error("parsePlan error", err);
      toast.error(err.message || "Failed to parse plan");
    } finally {
      setParsingPlan(false);
    }
  };



  const toggleComplete = async (id: string, completed: boolean) => {
    try {
      await supabase.from("weekly_intentions").update({ completed: !completed }).eq("id", id);
      setIntentions((prev) => prev.map((i) => (i.id === id ? { ...i, completed: !completed } : i)));
    } catch (err) {
      console.error("Error toggling:", err);
    }
  };

  const setDay = async (id: string, day: number | null) => {
    try {
      await supabase.from("weekly_intentions").update({ day_of_week: day } as any).eq("id", id);
      setIntentions((prev) => prev.map((i) => (i.id === id ? { ...i, day_of_week: day } : i)));
    } catch (err) {
      console.error("Error setting day:", err);
    }
  };

  const removeIntention = async (id: string) => {
    try {
      await supabase.from("weekly_intentions").delete().eq("id", id);
      setIntentions((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      console.error("Error removing:", err);
    }
  };

  // Auto-check: pull last 7 days of what the user actually did/captured and
  // cross off any incomplete intention whose meaning shows up in that activity.
  // Uses stem-prefix matching so "posting" matches "post/posts/posted".
  const STOPWORDS = new Set(["the","a","an","and","or","but","of","to","in","on","for","with","from","by","is","are","was","were","be","been","this","that","it","its","as","at","if","then","so","do","does","did","have","has","had","you","your","my","our","we","they","not","no","just","some","any","more","today","week","daily","also","about","into","out","up","down","need","want","going","get","gonna","make","made","take","took","really","very"]);
  const stem = (w: string) => w.length > 5 ? w.slice(0, 5) : w;
  const tokenize = (s: string): string[] =>
    (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOPWORDS.has(w)).map(stem);

  const autoCheckFromActivity = async (verbose: boolean) => {
    if (!user) return;
    const incomplete = intentions.filter((i) => !i.completed);
    if (incomplete.length === 0) {
      if (verbose) toast.message("Nothing left to check off");
      return;
    }
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceIso = since.toISOString();
    const sinceDate = since.toISOString().slice(0, 10);

    const [tasksRes, actionsRes, obsRes, insightsRes, convosRes] = await Promise.all([
      supabase.from("daily_tasks").select("one_thing, description, pillar").eq("user_id", user.id).eq("completed", true).gte("task_date", sinceDate),
      supabase.from("action_history").select("action_text, pillar").eq("user_id", user.id).gte("action_date", sinceDate),
      supabase.from("observations").select("content").eq("user_id", user.id).gte("created_at", sinceIso).limit(200),
      supabase.from("insights").select("title, content").eq("user_id", user.id).gte("created_at", sinceIso).limit(100),
      supabase.from("conversations").select("title, messages").eq("user_id", user.id).gte("updated_at", sinceIso).limit(30),
    ]);

    const activityBlobs: Array<{ text: string; pillar?: string | null }> = [];
    (tasksRes.data || []).forEach((t: any) => activityBlobs.push({ text: `${t.one_thing || ""} ${t.description || ""}`, pillar: t.pillar }));
    (actionsRes.data || []).forEach((a: any) => activityBlobs.push({ text: a.action_text || "", pillar: a.pillar }));
    (obsRes.data || []).forEach((o: any) => activityBlobs.push({ text: o.content || "" }));
    (insightsRes.data || []).forEach((i: any) => activityBlobs.push({ text: `${i.title || ""} ${i.content || ""}` }));
    (convosRes.data || []).forEach((c: any) => {
      const msgs = Array.isArray(c.messages) ? c.messages.map((m: any) => m?.content || "").join(" ") : "";
      activityBlobs.push({ text: `${c.title || ""} ${msgs}` });
    });

    const activity = activityBlobs
      .map((b) => ({ tokens: new Set(tokenize(b.text)), pillar: b.pillar }))
      .filter((s) => s.tokens.size > 0);
    if (activity.length === 0) {
      if (verbose) toast.message("No recent activity to match against");
      return;
    }

    const toCheck: string[] = [];
    for (const it of incomplete) {
      const itTokens = tokenize(it.text);
      if (itTokens.length < 1) continue;
      const required = itTokens.length <= 3 ? 1 : 2;
      const matched = activity.some(({ tokens: set, pillar }) => {
        let hits = 0;
        for (const t of itTokens) if (set.has(t)) hits++;
        // Same-pillar bonus so a matching-pillar capture with 1 keyword counts.
        if ((it as any).pillar && pillar && (it as any).pillar === pillar) hits += 1;
        return hits >= required;
      });
      if (matched) toCheck.push(it.id);
    }

    if (toCheck.length === 0) {
      if (verbose) toast.message("Nothing matched yet — keep going");
      return;
    }
    await supabase.from("weekly_intentions").update({ completed: true }).in("id", toCheck);
    setIntentions((prev) => prev.map((i) => (toCheck.includes(i.id) ? { ...i, completed: true } : i)));
    toast.success(`Checked ${toCheck.length} from what you did`);
  };


  const completedCount = intentions.filter((i) => i.completed).length;

  const groundingLine = identityContext?.coreValues
    ? identityContext.coreValues.split(/[,\n]/).slice(0, 3).map((v) => v.trim()).filter(Boolean).join(" · ")
    : identityContext?.yearNote
      ? identityContext.yearNote.substring(0, 60) + (identityContext.yearNote.length > 60 ? "..." : "")
      : null;

  const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

  // Filter intentions: null day = shown in "any day"; otherwise grouped by day
  const filtered =
    selectedDay === null ? intentions : intentions.filter((i) => i.day_of_week === selectedDay || i.day_of_week === null);

  // Group by day for the full breakdown (used when "Any day" is selected)
  const byDay: Record<string, Intention[]> = { any: [] };
  for (let i = 0; i < 7; i++) byDay[i] = [];
  for (const it of intentions) {
    if (it.day_of_week === null || it.day_of_week === undefined) byDay.any.push(it);
    else byDay[it.day_of_week].push(it);
  }

  const FULL_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <Card className="p-4 rounded-2xl space-y-3 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <ListTodo className="h-4 w-4 text-primary mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">This Week</h3>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              Paste your ideal Mon–Sun below and I'll reverse-engineer it into daily anchors — or add items one at a time.
            </p>
          </div>
        </div>
        {intentions.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => autoCheckFromActivity(true)}
              className="text-[10px] uppercase tracking-widest text-muted-foreground/50 hover:text-primary transition-colors"
              title="Check off anything you already did or captured this week"
            >
              Sync
            </button>
            <span className="text-xs text-muted-foreground">
              {completedCount}/{intentions.length} done
            </span>
          </div>
        )}
      </div>

      {groundingLine && (
        <p className="text-[11px] text-muted-foreground/60 italic px-1">Grounded in: {groundingLine}</p>
      )}

      {/* Day selector: Any + M T W T F S S */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedDay(null)}
          className={`shrink-0 text-[11px] h-7 px-2.5 rounded-full border transition-colors ${
            selectedDay === null
              ? "bg-primary/10 border-primary/30 text-primary"
              : "border-border/40 text-muted-foreground hover:text-foreground"
          }`}
        >
          Any day
        </button>
        {DAY_LABELS.map((label, idx) => {
          const dayDate = addDays(weekStart, idx);
          const isToday = isSameDay(dayDate, today);
          const isActive = selectedDay === idx;
          const count = intentions.filter((i) => i.day_of_week === idx).length;
          return (
            <button
              key={idx}
              onClick={() => setSelectedDay(idx)}
              title={format(dayDate, "EEEE, MMM d")}
              className={`shrink-0 flex flex-col items-center justify-center h-9 w-9 rounded-full border text-[10px] transition-colors ${
                isActive
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : isToday
                    ? "border-primary/25 text-foreground"
                    : "border-border/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="leading-none font-medium">{label}</span>
              {count > 0 && <span className="text-[9px] leading-none mt-0.5 opacity-60">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <Input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder={
            selectedDay === null
              ? "What do you want to do this week?"
              : `Add to ${format(addDays(weekStart, selectedDay), "EEEE")}`
          }
          className="text-sm h-9"
          onKeyDown={(e) => e.key === "Enter" && addIntention()}
        />
        {isSupported && (
          <Button
            size="sm"
            variant={isRecording ? "destructive" : "outline"}
            className="h-9 w-9 p-0 shrink-0"
            onClick={toggleRecording}
          >
            {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          </Button>
        )}
        <Button size="sm" className="h-9 px-3 shrink-0" onClick={addIntention} disabled={!newText.trim() || adding}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Paste-a-plan: AI breakdown */}
      <div className="rounded-xl border border-dashed border-border/40 bg-muted/20">
        <button
          onClick={() => setShowPlanPaste((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Wand2 className="h-3 w-3" />
            Paste a full weekly plan — I'll break it down
          </span>
          {showPlanPaste ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {showPlanPaste && (
          <div className="px-3 pb-3 space-y-2">
            <Textarea
              value={planText}
              onChange={(e) => setPlanText(e.target.value)}
              placeholder={`Paste your weekly plan. Sections, targets, floors, day-specific commitments — I'll split into atomic items, pillar-tag them, and assign days when mentioned.\n\nExample:\nJob Search — Target 5-10 apps/day. Weekly floor: 33.\nBody — 4 sessions. Tuesday: 30-45m workout. Friday: gym.`}
              className="min-h-[140px] text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => { setPlanText(""); setShowPlanPaste(false); }}
                disabled={parsingPlan}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={parsePlan}
                disabled={!planText.trim() || parsingPlan}
              >
                {parsingPlan ? <><Loader2 className="h-3 w-3 animate-spin" /> Weaving…</> : <><Wand2 className="h-3 w-3" /> Break it down</>}
              </Button>
            </div>
          </div>
        )}
      </div>

      {identityContext && intentions.length < 3 && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleSuggest}
          disabled={suggesting}
          className="w-full h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5"
        >
          {suggesting ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Weaving from your identity...
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" /> Suggest from my identity
            </>
          )}
        </Button>
      )}

      {/* Grouped breakdown when viewing all; flat interactive list when a day is selected */}
      {selectedDay === null && intentions.length > 0 && (() => {
        const sortItems = (arr: Intention[]) =>
          [...arr].sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            const pa = a.pillar || "zzz";
            const pb = b.pillar || "zzz";
            if (pa !== pb) return pa.localeCompare(pb);
            return a.sort_order - b.sort_order;
          });

        const renderItem = (it: Intention, showSetDay = false) => (
          <li key={it.id} className="flex items-start gap-2 group py-1">
            <button onClick={() => toggleComplete(it.id, it.completed)} className="shrink-0 mt-0.5" aria-label="toggle complete">
              {it.completed ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground/60" />}
            </button>
            <span className={`text-xs leading-snug flex-1 ${it.completed ? "line-through text-muted-foreground/50" : "text-foreground/85"}`}>
              {it.text}
            </span>
            {it.pillar && (
              <Badge variant="secondary" className={`text-[9px] h-4 px-1.5 shrink-0 mt-0.5 ${PILLAR_COLORS[it.pillar] || "bg-muted text-muted-foreground"}`}>
                {it.pillar}
              </Badge>
            )}
            {showSetDay && (
              <button
                onClick={() => {
                  const next = it.day_of_week === null ? 0 : it.day_of_week >= 6 ? null : it.day_of_week + 1;
                  setDay(it.id, next);
                }}
                className="text-[9px] h-4 px-1.5 rounded border border-border/40 text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
                title="Assign a day"
              >
                set day
              </button>
            )}
            <button onClick={() => removeIntention(it.id)} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" aria-label="remove">
              <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
            </button>
          </li>
        );

        // Disperse unscheduled: attach as "flex" items to today's card so they surface in-context.
        const todayIdx = ((today.getDay() + 6) % 7); // Mon=0..Sun=6
        const daysWithContent = new Set<number>();
        for (let i = 0; i < 7; i++) if ((byDay[i] || []).length > 0) daysWithContent.add(i);
        daysWithContent.add(todayIdx);

        const flexByDay: Record<number, Intention[]> = {};
        if (byDay.any.length > 0) {
          // put all flex items on today's card; keeps things simple and always in-view
          flexByDay[todayIdx] = byDay.any;
        }

        return (
          <div className="space-y-2 pt-1">
            {/* Mon–Sun, always in order, render if items or flex exist */}
            {[...Array(7)].map((_, idx) => {
              const items = byDay[idx] || [];
              const flex = flexByDay[idx] || [];
              if (items.length === 0 && flex.length === 0) return null;
              const dayDate = addDays(weekStart, idx);
              const isToday = isSameDay(dayDate, today);
              const done = items.filter((i) => i.completed).length + flex.filter((i) => i.completed).length;
              const total = items.length + flex.length;
              return (
                <div
                  key={idx}
                  className={`rounded-lg border p-3 ${isToday ? "border-primary/40 bg-primary/5" : "border-border/30 bg-background/40"}`}
                >
                  <div className="flex items-baseline justify-between mb-1.5">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-[11px] font-semibold uppercase tracking-wider ${isToday ? "text-primary" : "text-foreground/70"}`}>
                        {FULL_DAY_LABELS[idx]}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">{format(dayDate, "MMM d")}</span>
                      {isToday && <span className="text-[9px] text-primary/70 uppercase tracking-wider">today</span>}
                    </div>
                    <span className="text-[10px] text-muted-foreground/50">{done}/{total}</span>
                  </div>
                  <ul className="divide-y divide-border/20">
                    {sortItems(items).map((it) => renderItem(it, false))}
                    {flex.length > 0 && (
                      <>
                        {items.length > 0 && (
                          <li className="pt-1.5 pb-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/50">
                            Flex — assign a day
                          </li>
                        )}
                        {sortItems(flex).map((it) => (
                          <li key={it.id} className="flex items-start gap-2 group py-1">
                            <button onClick={() => toggleComplete(it.id, it.completed)} className="shrink-0 mt-0.5" aria-label="toggle complete">
                              {it.completed ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground/60" />}
                            </button>
                            <span className={`text-xs leading-snug flex-1 italic ${it.completed ? "line-through text-muted-foreground/50" : "text-foreground/75"}`}>
                              {it.text}
                            </span>
                            {it.pillar && (
                              <Badge variant="secondary" className={`text-[9px] h-4 px-1.5 shrink-0 mt-0.5 ${PILLAR_COLORS[it.pillar] || "bg-muted text-muted-foreground"}`}>
                                {it.pillar}
                              </Badge>
                            )}
                            <button
                              onClick={() => {
                                const next = it.day_of_week === null ? 0 : it.day_of_week >= 6 ? null : it.day_of_week + 1;
                                setDay(it.id, next);
                              }}
                              className="text-[9px] h-4 px-1.5 rounded border border-border/40 text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
                              title="Assign a day"
                            >
                              set day
                            </button>
                            <button onClick={() => removeIntention(it.id)} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" aria-label="remove">
                              <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                            </button>
                          </li>
                        ))}
                      </>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        );
      })()}


      {selectedDay !== null && filtered.length > 0 && (
        <div className="space-y-1">
          {filtered.map((intention) => (
            <div
              key={intention.id}
              className="flex items-center gap-2 group py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <button onClick={() => toggleComplete(intention.id, intention.completed)} className="shrink-0">
                {intention.completed ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              <span className={`text-sm flex-1 ${intention.completed ? "line-through text-muted-foreground" : ""}`}>
                {intention.text}
              </span>
              {intention.pillar && (
                <Badge
                  variant="secondary"
                  className={`text-[10px] h-4 px-1.5 ${PILLAR_COLORS[intention.pillar] || "bg-muted text-muted-foreground"}`}
                >
                  {intention.pillar}
                </Badge>
              )}
              <button
                onClick={() => {
                  const next = intention.day_of_week === null ? 0 : intention.day_of_week >= 6 ? null : intention.day_of_week + 1;
                  setDay(intention.id, next);
                }}
                className="text-[10px] h-4 px-1.5 rounded border border-border/40 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                title="Click to change day"
              >
                {intention.day_of_week === null ? "any" : DAY_LABELS[intention.day_of_week]}
              </button>
              <button
                onClick={() => removeIntention(intention.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground text-center py-2">
          {selectedDay === null ? "Add what you want to accomplish this week, or paste your ideal Mon–Sun above" : "Nothing scheduled for this day yet"}
        </p>
      )}
    </Card>
  );
}
