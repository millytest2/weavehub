import { useMemo, useState } from "react";
import { Brain, ChevronRight, RefreshCw } from "lucide-react";

/**
 * CriticalThinkingGuard
 * Small daily provocation to keep Miles from cognitively offloading.
 * Grounded in the MT Research Development Program (foundational questions,
 * elements of thought) + UPath Epistemology of Trust (show work, name
 * uncertainty, translate numeracy).
 *
 * Rotates deterministically by day so it feels intentional, not random.
 */

type Prompt = {
  lens: string;
  question: string;
  why: string;
};

const PROMPTS: Prompt[] = [
  { lens: "Foundational", question: "What is the real problem you're trying to solve today — not the obvious one?", why: "The $5 is the trap. Name the actual asset." },
  { lens: "Hypothesis", question: "What's your working hypothesis and what evidence would change your mind?", why: "A belief you can't falsify isn't thinking, it's identity." },
  { lens: "Assumption", question: "Which assumption are you treating as a fact right now?", why: "Assumptions run silent until you write them down." },
  { lens: "So What", question: "So what? Why does this matter to the person you're becoming this month?", why: "If it doesn't pass the so-what test, it's noise." },
  { lens: "Counter-view", question: "Who would disagree with your read, and what's the strongest version of their case?", why: "Steelman before you commit." },
  { lens: "Numeracy", question: "What's the denominator behind the number that convinced you?", why: "The average is a lie. Disaggregate." },
  { lens: "Source Hierarchy", question: "Is this a wire report, an essay, or grey literature — and are you cross-verifying?", why: "Trust the mix, not the loudest voice." },
  { lens: "Uncertainty", question: "What do you not know yet, and can you say it out loud?", why: "Naming uncertainty is the strongest trust signal in 2026." },
  { lens: "Offloading Check", question: "Did the model do the thinking, or did you?", why: "AI is degrading evaluation. Interrogate the answer before you use it." },
  { lens: "Assumption Audit", question: "If you removed your three biggest assumptions, what plan would survive?", why: "Non-linear thinking → non-linear outcomes." },
  { lens: "Points of View", question: "Whose perspective are you missing — worker, employer, family, older Miles?", why: "Every problem is influenced by multiple things." },
  { lens: "Show the Work", question: "Could you defend this decision with the data and the reasoning, not just the vibe?", why: "In an AI-flooded world, transparency is the trust moat." },
  { lens: "Distraction", question: "What are you treating as the constraint that is actually a decoy?", why: "The winning group ignored the $5." },
  { lens: "Curiosity", question: "What question, if answered honestly today, would change the shape of your week?", why: "One good question > ten polished answers." },
];

export function CriticalThinkingGuard() {
  const dayIndex = useMemo(() => {
    const start = new Date(new Date().getFullYear(), 0, 0);
    const diff = Date.now() - start.getTime();
    return Math.floor(diff / 86400000);
  }, []);

  const [offset, setOffset] = useState(0);
  const prompt = PROMPTS[(dayIndex + offset) % PROMPTS.length];

  return (
    <div className="mt-6 rounded-2xl border border-border/50 bg-card/40 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center text-[11px] tracking-[0.15em] uppercase text-muted-foreground/60">
          Critical thinking check
        </div>
        <button
          onClick={() => setOffset((o) => o + 1)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
          title="Another lens"
        >
          <RefreshCw className="h-3 w-3" />
          Next lens
        </button>
      </div>

      <div className="flex items-start gap-3">
        <ChevronRight className="h-4 w-4 text-primary/60 mt-1 shrink-0" />
        <div className="space-y-2">
          <p className="text-[15px] font-display leading-snug text-foreground">
            {prompt.question}
          </p>
          <p className="text-[12px] text-muted-foreground/70 leading-relaxed">
            <span className="text-muted-foreground/50">{prompt.lens}.</span> {prompt.why}
          </p>
        </div>
      </div>
    </div>
  );
}
