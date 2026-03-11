import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Check, 
  Circle, 
  X, 
  ListTodo,
  Mic,
  MicOff
} from "lucide-react";
import { toast } from "sonner";
import { getWeek, getYear } from "date-fns";
import { useVoiceCaptureWebSpeech } from "@/hooks/useVoiceCaptureWebSpeech";

interface Intention {
  id: string;
  text: string;
  pillar: string | null;
  completed: boolean;
  sort_order: number;
}

const PILLAR_COLORS: Record<string, string> = {
  Stability: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  Health: "bg-green-500/15 text-green-600 dark:text-green-400",
  Content: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  Connection: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  Presence: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  Skill: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  Learning: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  Admin: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
};

const PILLAR_KEYWORDS: Record<string, string[]> = {
  Stability: ["money", "income", "rent", "job", "apply", "interview", "salary", "save", "budget", "financial", "pay", "bills", "freelance", "client", "invoice"],
  Health: ["gym", "workout", "run", "walk", "sleep", "eat", "cook", "meal", "stretch", "yoga", "exercise", "water", "fast", "weight", "body", "meditate"],
  Content: ["post", "write", "video", "tiktok", "youtube", "tweet", "thread", "newsletter", "substack", "blog", "publish", "edit", "record", "share", "draft", "content"],
  Connection: ["call", "reach out", "text", "meet", "friend", "family", "network", "dm", "coffee", "hang", "visit", "relationship", "date", "check in"],
  Presence: ["journal", "reflect", "breathe", "ground", "meditat", "mindful", "gratitude", "pray", "intention", "slow down", "stillness", "awareness"],
  Skill: ["build", "code", "design", "learn", "course", "practice", "ship", "deploy", "project", "prototype", "develop", "create", "app", "tool"],
  Learning: ["read", "book", "article", "study", "research", "podcast", "listen", "watch", "notes", "review", "understand", "explore"],
  Admin: ["clean", "organize", "email", "inbox", "errands", "laundry", "dishes", "appointment", "schedule", "tax", "paperwork", "update", "fix", "cancel"],
};

function detectPillar(text: string): string | null {
  const lower = text.toLowerCase();
  let bestPillar: string | null = null;
  let bestScore = 0;
  
  for (const [pillar, keywords] of Object.entries(PILLAR_KEYWORDS)) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestPillar = pillar;
    }
  }
  
  return bestPillar;
}

// Split compound entries like "go to gym and post on twitter" into separate items
function splitCompoundEntry(text: string): string[] {
  // Split on " and ", ", ", " + " but not within short phrases
  const parts = text
    .split(/\s+and\s+|\s*,\s+|\s*\+\s+/i)
    .map(p => p.trim())
    .filter(p => p.length > 3); // Filter out tiny fragments
  
  // Only split if each part is meaningful (has a verb-like word)
  if (parts.length > 1 && parts.every(p => p.split(/\s+/).length >= 2)) {
    return parts;
  }
  
  return [text];
}

export function WeeklyIntentions() {
  const { user } = useAuth();
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [newText, setNewText] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const weekNumber = getWeek(new Date(), { weekStartsOn: 1 });
  const year = getYear(new Date());

  const { isRecording, toggleRecording, isSupported } = useVoiceCaptureWebSpeech({
    maxDuration: 30,
    onTranscript: (text) => {
      setNewText(text);
    }
  });

  useEffect(() => {
    if (user) fetchIntentions();
  }, [user]);

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
      
      setIntentions(data || []);
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
      }));
      
      const { error } = await supabase.from("weekly_intentions").insert(inserts);
      if (error) throw error;
      if (entries.length > 1) {
        toast.success(`Split into ${entries.length} items`);
      }
      setNewText("");
      fetchIntentions();
    } catch (err) {
      console.error("Error adding intention:", err);
      toast.error("Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const toggleComplete = async (id: string, completed: boolean) => {
    try {
      await supabase
        .from("weekly_intentions")
        .update({ completed: !completed })
        .eq("id", id);
      setIntentions(prev =>
        prev.map(i => i.id === id ? { ...i, completed: !completed } : i)
      );
    } catch (err) {
      console.error("Error toggling:", err);
    }
  };

  const removeIntention = async (id: string) => {
    try {
      await supabase.from("weekly_intentions").delete().eq("id", id);
      setIntentions(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      console.error("Error removing:", err);
    }
  };

  const completedCount = intentions.filter(i => i.completed).length;

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

      {/* Input */}
      <div className="flex gap-2">
        <Input
          value={newText}
          onChange={e => setNewText(e.target.value)}
          placeholder="What do you want to do this week?"
          className="text-sm h-9"
          onKeyDown={e => e.key === "Enter" && addIntention()}
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
        <Button
          size="sm"
          className="h-9 px-3 shrink-0"
          onClick={addIntention}
          disabled={!newText.trim() || adding}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Intentions list */}
      {intentions.length > 0 && (
        <div className="space-y-1">
          {intentions.map(intention => (
            <div
              key={intention.id}
              className="flex items-center gap-2 group py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <button
                onClick={() => toggleComplete(intention.id, intention.completed)}
                className="shrink-0"
              >
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
                <Badge variant="secondary" className={`text-[10px] h-4 px-1.5 ${PILLAR_COLORS[intention.pillar] || ""}`}>
                  {intention.pillar}
                </Badge>
              )}
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

      {intentions.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Add what you want to accomplish this week
        </p>
      )}
    </Card>
  );
}
