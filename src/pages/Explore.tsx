import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Lightbulb, 
  Sparkles,
  RefreshCw,
  Route
} from "lucide-react";
import { WeaveLoader } from "@/components/ui/weave-loader";
import { ThreadView } from "@/components/explore/ThreadView";

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
  const [isWeaving, setIsWeaving] = useState(false);
  const [currentWeave, setCurrentWeave] = useState<{
    insight: { id: string; title: string; content: string; source?: string };
    connection: string;
    application: string;
  } | null>(null);

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

  const handleWeave = async () => {
    if (!user) return;
    setIsWeaving(true);
    setCurrentWeave(null);

    try {
      const { data, error } = await supabase.functions.invoke("weave-synthesis", {
        body: { action: "surface_one", includeSynthesis: true }
      });

      if (!error && data?.insight) {
        setCurrentWeave({
          insight: {
            id: data.insight.id,
            title: data.insight.title,
            content: data.insight.content,
            source: data.insight.source,
          },
          connection: data.connection || "Part of your captured wisdom",
          application: data.application || "How might this inform a decision today?",
        });

        await supabase.rpc("update_item_access", {
          table_name: "insights",
          item_id: data.insight.id
        });
      } else {
        toast.error("Couldn't weave - try again");
      }
    } catch (error) {
      console.error("Weave error:", error);
      toast.error("Failed to weave");
    } finally {
      setIsWeaving(false);
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
            <Sparkles className="h-4 w-4 inline mr-1.5 -mt-0.5" />
            Weave
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
              className="space-y-4"
            >
              {/* Weave action */}
              <Card className="p-5 rounded-2xl text-center">
                <Sparkles className="h-8 w-8 text-primary mx-auto mb-3" />
                <h3 className="font-display text-lg font-semibold mb-1">
                  Surface a forgotten gem
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Let the system weave an insight you haven't seen in a while back into your awareness
                </p>
                <Button
                  onClick={handleWeave}
                  disabled={isWeaving || insightCount === 0}
                  className="w-full"
                >
                  {isWeaving ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Weaving...</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-2" /> Weave Something</>
                  )}
                </Button>
              </Card>

              {/* Current weave result */}
              <AnimatePresence>
                {currentWeave && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <Card className="p-4 rounded-2xl space-y-3">
                      <div className="flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-primary" />
                        <span className="text-xs text-muted-foreground">
                          {currentWeave.insight.source || "Captured insight"}
                        </span>
                      </div>
                      <h3 className="font-semibold">{currentWeave.insight.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {currentWeave.insight.content}
                      </p>

                      <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
                        <p className="text-xs text-primary font-medium mb-1">How this connects</p>
                        <p className="text-sm">{currentWeave.connection}</p>
                      </div>

                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={handleWeave}
                        disabled={isWeaving}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Weave another
                      </Button>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MainLayout>
  );
};

export default Explore;
