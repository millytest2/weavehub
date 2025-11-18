import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Lightbulb, Target, TrendingUp } from "lucide-react";
import { z } from "zod";

const identitySeedSchema = z.object({
  content: z.string().trim().min(1, "Identity seed content is required").max(50000, "Content must be less than 50,000 characters"),
});

export default function IdentitySeed() {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [identitySeedId, setIdentitySeedId] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState<"baseline" | "empire">("baseline");
  const [targetMonthlyIncome, setTargetMonthlyIncome] = useState(4000);
  const [currentMonthlyIncome, setCurrentMonthlyIncome] = useState(0);
  const [jobAppsThisWeek, setJobAppsThisWeek] = useState(0);
  const [jobAppsGoal, setJobAppsGoal] = useState(50);
  const [daysToMove, setDaysToMove] = useState<number | undefined>();
  const [weeklyFocus, setWeeklyFocus] = useState("");

  useEffect(() => {
    if (user) {
      fetchIdentitySeed();
    }
  }, [user]);

  const fetchIdentitySeed = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("identity_seeds")
        .select("*")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching identity seed:", error);
        return;
      }

      if (data) {
        setContent(data.content);
        setIdentitySeedId(data.id);
        setCurrentPhase(data.current_phase || "baseline");
        setTargetMonthlyIncome(data.target_monthly_income || 4000);
        setCurrentMonthlyIncome(data.current_monthly_income || 0);
        setJobAppsThisWeek(data.job_apps_this_week || 0);
        setJobAppsGoal(data.job_apps_goal || 50);
        setDaysToMove(data.days_to_move);
        setWeeklyFocus(data.weekly_focus || "");
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleSave = async () => {
    // Validate input
    const validation = identitySeedSchema.safeParse({ content });
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast.error(firstError.message);
      return;
    }

    setLoading(true);
    try {
      const updateData = {
        content: validation.data.content,
        current_phase: currentPhase,
        target_monthly_income: targetMonthlyIncome,
        current_monthly_income: currentMonthlyIncome,
        job_apps_this_week: jobAppsThisWeek,
        job_apps_goal: jobAppsGoal,
        days_to_move: daysToMove,
        weekly_focus: weeklyFocus,
      };

      if (identitySeedId) {
        const { error } = await (supabase as any)
          .from("identity_seeds")
          .update(updateData)
          .eq("id", identitySeedId);

        if (error) throw error;
        toast.success("Identity seed updated");
      } else {
        const { data, error } = await (supabase as any)
          .from("identity_seeds")
          .insert({ user_id: user?.id, ...updateData })
          .select()
          .single();

        if (error) throw error;
        setIdentitySeedId(data.id);
        toast.success("Identity seed created");
      }
    } catch (error) {
      console.error("Error saving identity seed:", error);
      toast.error("Failed to save identity seed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Lightbulb className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Identity Seed</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Your North Star — the foundation of who you are becoming and who you already are now.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Phase Selector */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Target className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">Current Phase</h2>
          </div>
          <Select value={currentPhase} onValueChange={(v) => setCurrentPhase(v as "baseline" | "empire")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="baseline">Baseline Phase (Stability First)</SelectItem>
              <SelectItem value="empire">Empire Phase (Growth & Scale)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-2">
            {currentPhase === "baseline" 
              ? "Focus: Lock in $3-5K/month stable income. Everything serves job search, bartending, UPath reports, and LA move prep."
              : "Focus: Scale content, experiments, and UPath. Build authority and revenue beyond baseline."}
          </p>
        </Card>

        {/* Baseline Tracking (only show in baseline phase) */}
        {currentPhase === "baseline" && (
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">Baseline Metrics</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium mb-2 block">Target Monthly Income</label>
                <Input
                  type="number"
                  value={targetMonthlyIncome}
                  onChange={(e) => setTargetMonthlyIncome(Number(e.target.value))}
                  placeholder="4000"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Current Monthly Income</label>
                <Input
                  type="number"
                  value={currentMonthlyIncome}
                  onChange={(e) => setCurrentMonthlyIncome(Number(e.target.value))}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Job Apps This Week</label>
                <Input
                  type="number"
                  value={jobAppsThisWeek}
                  onChange={(e) => setJobAppsThisWeek(Number(e.target.value))}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Job Apps Goal (per week)</label>
                <Input
                  type="number"
                  value={jobAppsGoal}
                  onChange={(e) => setJobAppsGoal(Number(e.target.value))}
                  placeholder="50"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Days Until LA Move</label>
                <Input
                  type="number"
                  value={daysToMove || ""}
                  onChange={(e) => setDaysToMove(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">This Week's Focus</label>
                <Input
                  value={weeklyFocus}
                  onChange={(e) => setWeeklyFocus(e.target.value)}
                  placeholder="e.g., 50 hospitality apps"
                />
              </div>
            </div>
          </Card>
        )}

        {/* Identity Seed Content */}
        <Card className="p-6">
          <div>
            <label className="text-sm font-medium mb-2 block">
              Your Identity Statement
            </label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="I am a Full-Stack Human — mind, body, spirit, creativity, ambition, and calm grounded presence working together..."
              className="min-h-[300px] text-base leading-relaxed resize-none"
            />
            <p className="text-xs text-muted-foreground mt-2">
              This guides your spiritual connection, learning, projects, experiments, relationships, and daily actions.
            </p>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={loading}
            size="lg"
            className="gap-2"
          >
            {loading ? "Saving..." : "Save All"}
          </Button>
        </div>
      </div>
    </div>
  );
}
