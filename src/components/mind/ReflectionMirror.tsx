import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Ear, Swords, FileSearch, Loader2, ArrowUpRight } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Mode = "silence" | "disagree" | "provenance";

type Echo = {
  id: string;
  source: "observation" | "insight" | "identity" | "document";
  content: string;
  created_at: string;
  note: string;
  stance?: "backs" | "against" | "missing" | null;
};

type MirrorResult = { mode: Mode; frame: string; echoes: Echo[] };

const MODES: { id: Mode; label: string; icon: any; blurb: string; placeholder: string; cta: string }[] = [
  {
    id: "silence",
    label: "Silence",
    icon: Ear,
    blurb: "Ask a question. It won't answer. It returns your own past captures that already touched it.",
    placeholder: "The question you'd normally hand to ChatGPT…",
    cta: "Return my own words",
  },
  {
    id: "disagree",
    label: "Disagree",
    icon: Swords,
    blurb: "Name a direction you're leaning. It surfaces captures that contradict or complicate it.",
    placeholder: "The plan, opinion, or move you're about to commit to…",
    cta: "Push back on me",
  },
  {
    id: "provenance",
    label: "Provenance",
    icon: FileSearch,
    blurb: "Paste any claim or AI suggestion. See which of your captures back it, contradict it, or don't speak to it.",
    placeholder: "Paste the claim, AI answer, or plan you're evaluating…",
    cta: "Check the source",
  },
];

const STANCE_STYLES: Record<string, string> = {
  backs: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  against: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  missing: "bg-amber-500/10 text-amber-600 border-amber-500/20",
};

export const ReflectionMirror = () => {
  const [mode, setMode] = useState<Mode>("silence");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MirrorResult | null>(null);

  const current = MODES.find((m) => m.id === mode)!;

  const run = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("reflection-mirror", {
        body: { mode, input: input.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Mirror unavailable");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setInput("");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-display font-semibold">Reflection Mirror</h1>
        <p className="text-sm text-muted-foreground/60 max-w-md mx-auto">
          A mirror, not an answer engine. Returns <em>your</em> words back to you so you keep thinking.
        </p>
      </div>

      {/* Mode picker */}
      <div className="grid grid-cols-3 gap-2">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); reset(); }}
              className={`relative rounded-2xl border p-3 text-left transition-all ${
                active
                  ? "border-primary/40 bg-primary/5"
                  : "border-border/30 bg-card/50 hover:border-border/60"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-sm font-medium">{m.label}</span>
              </div>
              <p className="text-[11px] text-muted-foreground/70 leading-snug line-clamp-2">
                {m.id === "silence" && "Your past captures on this."}
                {m.id === "disagree" && "Captures that push back."}
                {m.id === "provenance" && "Back, against, or missing."}
              </p>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground/60 text-center px-4">{current.blurb}</p>

      <AnimatePresence mode="wait">
        {!result ? (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={current.placeholder}
              className="min-h-[140px] text-base rounded-2xl"
              style={{ fontSize: "16px" }}
              maxLength={2000}
            />
            <Button
              onClick={run}
              disabled={!input.trim() || loading}
              className="w-full h-12 rounded-2xl"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Pulling your captures…</>
              ) : (
                current.cta
              )}
            </Button>
            <p className="text-[11px] text-muted-foreground/50 text-center">
              Runs through your captures, observations, insights, documents, and identity seed. No new "answer" is generated.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            <div className="p-4 rounded-2xl border border-border/40 bg-muted/20">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-1.5">The frame</p>
              <p className="text-sm leading-relaxed">{result.frame}</p>
            </div>

            <div className="space-y-2.5">
              {result.echoes.map((e) => (
                <div key={e.id} className="p-4 rounded-2xl border border-border/30 bg-card">
                  <div className="flex items-center gap-2 mb-2 text-[11px] text-muted-foreground/70">
                    <span className="uppercase tracking-wider">{e.source}</span>
                    <span>·</span>
                    <span>{new Date(e.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    {e.stance && (
                      <span className={`ml-auto px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wider ${STANCE_STYLES[e.stance] || ""}`}>
                        {e.stance}
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{e.content}</p>
                  {e.note && (
                    <p className="mt-2 pt-2 border-t border-border/20 text-xs text-muted-foreground italic flex gap-1.5">
                      <ArrowUpRight className="h-3 w-3 shrink-0 mt-0.5" />
                      {e.note}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} className="flex-1 rounded-2xl">
                New reflection
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground/50 text-center italic">
              These are your words. The mirror won't finish the thought for you.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
