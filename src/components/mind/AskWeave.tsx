import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, FileText, Lightbulb, ArrowUpRight, Sparkles } from "lucide-react";
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

const SEEDS = [
  "What have I said about my content strategy?",
  "Where am I contradicting myself lately?",
  "What do I keep circling back to?",
  "What have I learned about my energy this month?",
];

export const AskWeave = () => {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
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
        ? "Here's what your own captures say on this. The synthesis is yours — read the sources."
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

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-14rem)] min-h-[520px]">
      <div className="text-center space-y-1 mb-4">
        <h1 className="text-2xl font-display font-semibold flex items-center justify-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Ask Weave
        </h1>
        <p className="text-xs text-muted-foreground/60 max-w-md mx-auto">
          Chat with your own captures, insights, and documents. Weave answers from your library, not the internet.
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1 pb-3">
        {turns.length === 0 && (
          <div className="pt-6 space-y-4">
            <p className="text-center text-xs text-muted-foreground/50">Try one of these to get going:</p>
            <div className="grid gap-2">
              {SEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="text-left text-sm px-3 py-2.5 rounded-xl border border-border/30 bg-card/50 hover:border-primary/40 hover:bg-primary/5 transition-all"
                >
                  {s}
                </button>
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
              transition={{ duration: 0.15 }}
            >
              {t.role === "user" ? (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-3.5 py-2 text-sm leading-relaxed">
                    {t.content}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm leading-relaxed text-foreground/90 px-1">{t.content}</p>
                  {t.items.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 px-1">
                        From your library
                      </p>
                      {t.items.map((it) => (
                        <div key={`${it.id}-${it.type}`} className="rounded-xl border border-border/30 bg-card/60 p-3">
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70 mb-1">
                            {it.type === "insight" ? <Lightbulb className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                            <span className="uppercase tracking-wider">{it.type}</span>
                            <span>·</span>
                            <span>
                              {new Date(it.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </span>
                          </div>
                          <p className="text-sm font-medium leading-snug">{it.title}</p>
                          {it.preview && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{it.preview}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground/70 px-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Searching your library…
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-border/20">
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask your own library anything…"
            className="min-h-[48px] max-h-32 text-base rounded-2xl resize-none"
            style={{ fontSize: "16px" }}
            rows={1}
          />
          <Button
            onClick={() => ask(input)}
            disabled={!input.trim() || loading}
            size="icon"
            className="h-11 w-11 rounded-2xl shrink-0"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/50 text-center mt-1.5 flex items-center justify-center gap-1">
          <ArrowUpRight className="h-2.5 w-2.5" />
          Answers come from your captures, insights, and documents only.
        </p>
      </div>
    </div>
  );
};
