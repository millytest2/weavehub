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

  return (
    <Card className="p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">This Week's Plan</h3>
        </div>
        {intentions.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {completedCount}/{intentions.length} done
          </span>
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

      {filtered.length > 0 && (
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
              {/* Day chip — click to cycle day */}
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
          {selectedDay === null ? "Add what you want to accomplish this week" : "Nothing scheduled for this day yet"}
        </p>
      )}
    </Card>
  );
}
