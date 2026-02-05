import { useState, useEffect, useMemo } from "react";
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
  Layers,
  Sparkles,
  RefreshCw
} from "lucide-react";
import { WeaveLoader } from "@/components/ui/weave-loader";
import { TopicClusterView } from "@/components/explore/TopicClusterView";

interface ContentItem {
  id: string;
  type: "insight" | "document" | "experiment";
  title: string;
  content: string;
  source?: string;
  created_at: string;
  last_accessed?: string;
  access_count?: number;
  topic_id?: string;
}

interface IdentityContext {
  yearNote?: string;
  weeklyFocus?: string;
  coreValues?: string;
  content?: string;
}

interface Topic {
  id: string;
  name: string;
  color?: string;
}

const Explore = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [insights, setInsights] = useState<ContentItem[]>([]);
  const [documents, setDocuments] = useState<ContentItem[]>([]);
  const [experiments, setExperiments] = useState<ContentItem[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [identityContext, setIdentityContext] = useState<IdentityContext | null>(null);
  const [activeTab, setActiveTab] = useState<"topics" | "weave">("topics");
  const [isWeaving, setIsWeaving] = useState(false);
  const [currentWeave, setCurrentWeave] = useState<{
    insight: ContentItem;
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
      const [insightsResult, docsResult, expResult, topicsResult, identityResult] = await Promise.all([
        supabase
          .from("insights")
          .select("id, title, content, source, created_at, last_accessed, access_count, topic_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("documents")
          .select("id, title, summary, created_at, last_accessed, access_count, topic_id")
          .eq("user_id", user.id),
        supabase
          .from("experiments")
          .select("id, title, description, created_at, topic_id")
          .eq("user_id", user.id),
        supabase
          .from("topics")
          .select("id, name, color")
          .eq("user_id", user.id),
        supabase
          .from("identity_seeds")
          .select("weekly_focus, year_note, core_values, content")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      const formattedInsights = (insightsResult.data || []).map(i => ({
        id: i.id,
        type: "insight" as const,
        title: i.title,
        content: i.content || "",
        source: i.source,
        created_at: i.created_at,
        last_accessed: i.last_accessed,
        access_count: i.access_count,
        topic_id: i.topic_id,
      }));

      const formattedDocs = (docsResult.data || []).map(d => ({
        id: d.id,
        type: "document" as const,
        title: d.title,
        content: d.summary || "",
        created_at: d.created_at,
        last_accessed: d.last_accessed,
        access_count: d.access_count,
        topic_id: d.topic_id,
      }));

      const formattedExps = (expResult.data || []).map(e => ({
        id: e.id,
        type: "experiment" as const,
        title: e.title,
        content: e.description || "",
        created_at: e.created_at,
        topic_id: e.topic_id,
      }));

      setInsights(formattedInsights);
      setDocuments(formattedDocs);
      setExperiments(formattedExps);
      setTopics(topicsResult.data || []);

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
        body: { 
          action: "surface_one",
          includeSynthesis: true
        }
      });

      if (!error && data?.insight) {
        setCurrentWeave({
          insight: {
            id: data.insight.id,
            type: "insight",
            title: data.insight.title,
            content: data.insight.content,
            source: data.insight.source,
            created_at: data.insight.created_at,
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

  const totalItems = insights.length + documents.length + experiments.length;

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <WeaveLoader size="lg" text="Mapping your knowledge..." />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-display font-semibold">Your Knowledge</h1>
          <p className="text-sm text-muted-foreground">
            {insights.length} insights • {documents.length} documents • {experiments.length} experiments
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 p-1 bg-muted/50 rounded-2xl">
          <button
            onClick={() => setActiveTab("topics")}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${
              activeTab === "topics" 
                ? "bg-background shadow-sm text-foreground" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="h-4 w-4 inline mr-1.5 -mt-0.5" />
            Topics
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
          {activeTab === "topics" ? (
            <motion.div
              key="topics"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Topic Clusters View */}
              {totalItems > 0 ? (
                <TopicClusterView
                  insights={insights.map(i => ({
                    id: i.id,
                    title: i.title,
                    content: i.content,
                    source: i.source,
                    topic_id: i.topic_id,
                    created_at: i.created_at,
                    last_accessed: i.last_accessed
                  }))}
                  documents={documents.map(d => ({
                    id: d.id,
                    title: d.title,
                    content: d.content,
                    topic_id: d.topic_id
                  }))}
                  experiments={experiments.map(e => ({
                    id: e.id,
                    title: e.title,
                    content: e.content,
                    topic_id: e.topic_id
                  }))}
                  topics={topics}
                  yearNote={identityContext?.yearNote}
                  userId={user?.id || ""}
                />
              ) : (
                <Card className="p-8 rounded-2xl text-center">
                  <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Start capturing insights to see your knowledge organized by topic
                  </p>
                </Card>
              )}
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
                  disabled={isWeaving || insights.length === 0}
                  className="w-full"
                >
                  {isWeaving ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Weaving...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Weave Something
                    </>
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
                      
                      {/* Connection to 2026 */}
                      <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
                        <p className="text-xs text-primary font-medium mb-1">
                          How this connects
                        </p>
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
