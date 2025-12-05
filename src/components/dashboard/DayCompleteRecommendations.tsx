import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Target, FlaskConical, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DayCompleteRecommendationsProps {
  userId: string;
  isComplete: boolean;
}

export const DayCompleteRecommendations = ({ userId, isComplete }: DayCompleteRecommendationsProps) => {
  const [open, setOpen] = useState(false);
  const [recommendations, setRecommendations] = useState<Array<{
    icon: any;
    title: string;
    description: string;
    action: string;
    route: string;
  }>>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (isComplete) {
      checkAndShowRecommendations();
    }
  }, [isComplete, userId]);

  const checkAndShowRecommendations = async () => {
    // Check what user has and hasn't done
    const [identityRes, experimentsRes, topicsRes, insightsRes] = await Promise.all([
      supabase.from("identity_seeds").select("id, content").eq("user_id", userId).maybeSingle(),
      supabase.from("experiments").select("id").eq("user_id", userId).limit(1).maybeSingle(),
      supabase.from("topics").select("id").eq("user_id", userId).limit(1).maybeSingle(),
      supabase.from("insights").select("id").eq("user_id", userId).limit(1).maybeSingle(),
    ]);

    const hasIdentity = identityRes.data && identityRes.data.content?.trim().length > 0;
    const hasExperiments = !!experimentsRes.data;
    const hasTopics = !!topicsRes.data;
    const hasInsights = !!insightsRes.data;

    const recs = [];

    // Priority 1: Identity if not set
    if (!hasIdentity) {
      recs.push({
        icon: Target,
        title: "Define Your Identity",
        description: "Set your north star. Define who you're becoming so Weave can guide your daily actions.",
        action: "Set Identity",
        route: "/identity-seed",
      });
    }

    // Priority 2: Create first experiment
    if (!hasExperiments) {
      recs.push({
        icon: FlaskConical,
        title: "Start Your First Experiment",
        description: "Test a new habit or skill. Run a real-world experiment to build evidence-based growth.",
        action: "Create Experiment",
        route: "/experiments",
      });
    }

    // Priority 3: Organize with topics
    if (!hasTopics) {
      recs.push({
        icon: BookOpen,
        title: "Create Your First Topic",
        description: "Organize your learning. Create topics to group related insights and documents.",
        action: "Add Topic",
        route: "/topics",
      });
    }

    // If they have everything, suggest daily focus
    if (hasIdentity && hasExperiments && hasTopics) {
      recs.push({
        icon: Sparkles,
        title: "Check Tomorrow's Focus",
        description: "You're all set up! Come back tomorrow for your next set of aligned actions.",
        action: "Got It",
        route: "/",
      });
    }

    setRecommendations(recs);
    
    // Only show if we have recommendations and haven't shown today
    const today = new Date().toISOString().split("T")[0];
    const lastShown = localStorage.getItem(`day_complete_shown_${userId}`);
    
    if (recs.length > 0 && lastShown !== today) {
      setOpen(true);
      localStorage.setItem(`day_complete_shown_${userId}`, today);
    }
  };

  const handleAction = (route: string) => {
    setOpen(false);
    if (route !== "/") {
      navigate(route);
    }
  };

  if (recommendations.length === 0) return null;

  const topRec = recommendations[0];
  const TopIcon = topRec.icon;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>All 3 Actions Complete</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <p className="text-sm text-muted-foreground text-center">
            Great work today. Here's what you can do next to keep building momentum:
          </p>

          {/* Primary recommendation */}
          <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <TopIcon className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="font-semibold text-sm">{topRec.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {topRec.description}
                </p>
              </div>
            </div>
            <Button onClick={() => handleAction(topRec.route)} className="w-full">
              {topRec.action}
            </Button>
          </div>

          {/* Other recommendations */}
          {recommendations.slice(1, 3).map((rec, index) => {
            const Icon = rec.icon;
            return (
              <button
                key={index}
                onClick={() => handleAction(rec.route)}
                className="w-full p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm">{rec.title}</h4>
                    <p className="text-xs text-muted-foreground truncate">{rec.description}</p>
                  </div>
                </div>
              </button>
            );
          })}

          <Button variant="ghost" onClick={() => setOpen(false)} className="w-full">
            Maybe Later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

