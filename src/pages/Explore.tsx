import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Route,
  Brain
} from "lucide-react";
import { WeaveLoader } from "@/components/ui/weave-loader";
import { ThreadView } from "@/components/explore/ThreadView";
import { MindSynthesis } from "@/components/explore/MindSynthesis";

interface IdentityContext {
  yearNote?: string;
  weeklyFocus?: string;
  coreValues?: string;
  content?: string;
}

const Explore = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [insightCount, setInsightCount] = useState(0);
  const [docCount, setDocCount] = useState(0);
  const [expCount, setExpCount] = useState(0);
  const [identityContext, setIdentityContext] = useState<IdentityContext | null>(null);
  const [activeTab, setActiveTab] = useState<"thread" | "weave">("thread");

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    loadData();
  }, [user, navigate]);

  const loadData = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const [insightsResult, docsResult, expResult, identityResult] = await Promise.all([
        supabase.from("insights").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("documents").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("experiments").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("identity_seeds")
          .select("weekly_focus, year_note, core_values, content")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      setInsightCount(insightsResult.count || 0);
      setDocCount(docsResult.count || 0);
      setExpCount(expResult.count || 0);

      if (identityResult.data) {
        setIdentityContext({
          yearNote: identityResult.data.year_note,
          weeklyFocus: identityResult.data.weekly_focus,
          coreValues: identityResult.data.core_values,
          content: identityResult.data.content,
        });
      }
    } catch (error) {
      console.error("Load error:", error);
      toast.error("Failed to load knowledge");
    } finally {
      setIsLoading(false);
    }
  };


  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <WeaveLoader size="lg" text="Loading The Thread..." />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-display font-semibold">The Thread</h1>
          <p className="text-sm text-muted-foreground">
            {insightCount} insights • {docCount} documents • {expCount} experiments
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 p-1 bg-muted/50 rounded-2xl">
          <button
            onClick={() => setActiveTab("thread")}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${
              activeTab === "thread"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Route className="h-4 w-4 inline mr-1.5 -mt-0.5" />
            Roadmap
          </button>
          <button
            onClick={() => setActiveTab("weave")}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${
              activeTab === "weave"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Brain className="h-4 w-4 inline mr-1.5 -mt-0.5" />
            Synthesize
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "thread" ? (
            <motion.div
              key="thread"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <ThreadView
                userId={user?.id || ""}
                yearNote={identityContext?.yearNote}
                weeklyFocus={identityContext?.weeklyFocus}
                insightCount={insightCount}
              />
            </motion.div>
          ) : (
            <motion.div
              key="weave"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <MindSynthesis insightCount={insightCount} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MainLayout>
  );
};

export default Explore;
