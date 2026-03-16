import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Layers } from "lucide-react";

interface Theme {
  label: string;
  count: number;
}

export const LabThemes = () => {
  const { user } = useAuth();
  const [themes, setThemes] = useState<Theme[]>([]);

  useEffect(() => {
    if (!user) return;
    detectThemes();
  }, [user]);

  const detectThemes = async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data } = await supabase
      .from("observations")
      .select("content, observation_type")
      .eq("user_id", user!.id)
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

    if (!data || data.length < 3) return;

    // Simple theme detection: extract meaningful phrases and count frequency
    const allText = data.map(d => d.content).join(' ').toLowerCase();
    const words = allText
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 4 && !STOP_WORDS.has(w));

    // Count bigrams (two-word phrases) for richer themes
    const phrases: Record<string, number> = {};
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      phrases[bigram] = (phrases[bigram] || 0) + 1;
    }
    // Also count single meaningful words
    const singles: Record<string, number> = {};
    words.forEach(w => { singles[w] = (singles[w] || 0) + 1; });

    // Combine: prefer bigrams, fall back to singles
    const detected: Theme[] = [];
    
    Object.entries(phrases)
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .forEach(([label, count]) => detected.push({ label, count }));

    Object.entries(singles)
      .filter(([word, count]) => count >= 3 && !detected.some(d => d.label.includes(word)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(0, 5 - detected.length))
      .forEach(([label, count]) => detected.push({ label, count }));

    setThemes(detected.slice(0, 5));
  };

  if (themes.length === 0) return null;

  return (
    <div className="space-y-2 px-1">
      <div className="flex items-center gap-2">
        <Layers className="h-3.5 w-3.5 text-muted-foreground/60" />
        <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest">
          Themes from your writing
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {themes.map((theme) => (
          <span
            key={theme.label}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-muted/40 text-muted-foreground border border-border/30"
          >
            {theme.label}
            <span className="text-[10px] text-muted-foreground/40">×{theme.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'being', 'could', 'every', 'first', 'going',
  'great', 'having', 'their', 'there', 'these', 'thing', 'things', 'think',
  'those', 'today', 'really', 'right', 'should', 'since', 'still', 'would',
  'which', 'while', 'where', 'other', 'people', 'start', 'started', 'doing',
  'getting', 'making', 'maybe', 'might', 'morning', 'never', 'something',
  'through', 'trying', 'until', 'wants', 'didn', 'doesn', 'haven', 'wasn',
]);
