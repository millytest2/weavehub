import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, FileText, Lightbulb, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type SurfaceItem = {
  id: string;
  type: "insight" | "document";
  title: string;
  preview: string;
  created_at: string;
};

type Turn =
  | { role: "user"; content: string }
  | { role: "weave"; content: string; items: SurfaceItem[]; empty?: boolean };

// Grouped, low-fatigue starters. Fewer, clearer, one intent each.
const SEED_GROUPS: { label: string; prompts: string[] }[] = [
  {
    label: "Reflect",
    prompts: [
      "What have I been circling back to this week?",
      "What does my recent writing say I actually care about?",
    ],
  },
  {
    label: "Cut through",
    prompts: [
      "Where am I contradicting myself lately?",
      "What am I avoiding that keeps showing up?",
    ],
  },
  {
    label: "Ground",
    prompts: [
      "What have I already decided about my content strategy?",
      "What have I learned about my energy this month?",
    ],
  },
];

export const AskWeave = () => {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;
    setInput("");
    setTurns((t) => [...t, { role: "user", content: q }]);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("retrieval-engine", {
        body: { action: "surface", query: q, limit: 6 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const items: SurfaceItem[] = Array.isArray(data?.items) ? data.items : [];
      const synthesis: string = (data?.synthesis || "").toString().trim();
      const fallback = items.length
        ? "Here is what your own captures say. Read one. Then decide."
        : "Nothing in your captures speaks to this yet. Write something first, then ask again.";
      setTurns((t) => [
        ...t,
        {
          role: "weave",
          content: synthesis || fallback,
          items,
          empty: items.length === 0,
        },
      ]);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Ask Weave is unavailable");
      setTurns((t) => [
        ...t,
        { role: "weave", content: "Couldn't reach your library right now. Try again in a moment.", items: [], empty: true },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(input);
    }
  };

  const reset = () => {
    setTurns([]);
    setExpanded({});
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-14rem)] min-h-[560px]">
      {/* Header — quieter, no icon-as-mascot */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-semibold leading-tight">Ask Weave</h1>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Your library, in conversation. No outside noise.
          </p>
        </div>
        {turns.length > 0 && (
          <button
            onClick={reset}
            className="text-[11px] uppercase tracking-widest text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 pr-1 pb-3">
        {turns.length === 0 && (
          <div className="pt-4 space-y-6">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground/40">
              Start with one
            </p>
            <div className="space-y-5">
              {SEED_GROUPS.map((group) => (
                <div key={group.label} className="space-y-2">
                  <p className="text-[11px] text-muted-foreground/50">{group.label}</p>
                  <div className="space-y-1.5">
                    {group.prompts.map((s) => (
                      <button
                        key={s}
                        onClick={() => ask(s)}
                        className="block w-full text-left text-[15px] leading-relaxed px-4 py-3 rounded-xl border border-border/25 bg-card/40 hover:border-primary/40 hover:bg-primary/5 transition-all"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {turns.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              {t.role === "user" ? (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-4 py-2.5 text-[15px] leading-relaxed">
                    {t.content}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Answer — larger text, generous line-height, no bubble */}
                  <p className="text-[16px] leading-[1.7] text-foreground/90 px-1 whitespace-pre-wrap">
                    {t.content}
                  </p>
                  {t.items.length > 0 && (
                    <div className="pt-1">
                      <button
                        onClick={() => setExpanded((e) => ({ ...e, [i]: !e[i] }))}
                        className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                      >
                        <ChevronDown className={`h-3 w-3 transition-transform ${expanded[i] ? "rotate-0" : "-rotate-90"}`} />
                        {t.items.length} from your library
                      </button>
                      <AnimatePresence initial={false}>
                        {expanded[i] && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-2 mt-3">
                              {t.items.map((it) => (
                                <div key={`${it.id}-${it.type}`} className="rounded-xl border border-border/25 bg-card/50 p-3">
                                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-1.5">
                                    {it.type === "insight" ? <Lightbulb className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                                    <span>{it.type}</span>
                                    <span>·</span>
                                    <span>
                                      {new Date(it.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                    </span>
                                  </div>
                                  <p className="text-[14px] font-medium leading-snug">{it.title}</p>
                                  {it.preview && (
                                    <p className="text-[13px] text-muted-foreground mt-1 line-clamp-3 leading-relaxed">{it.preview}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground/60 px-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Reading what you've already written…
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-border/20">
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="One question at a time…"
            className="min-h-[52px] max-h-32 text-base rounded-2xl resize-none border-border/40 focus-visible:ring-primary/30"
            style={{ fontSize: "16px" }}
            rows={1}
          />
          <Button
            onClick={() => ask(input)}
            disabled={!input.trim() || loading}
            size="icon"
            className="h-12 w-12 rounded-2xl shrink-0"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/45 text-center mt-2">
          Only your own captures. Nothing generated from the outside.
        </p>
      </div>
    </div>
  );
};
