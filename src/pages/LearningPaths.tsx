import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, BookOpen, Loader2, Play, Pause, CheckCircle2, Calendar, Target, Sparkles, ArrowRight, Zap } from "lucide-react";
import { parseFunctionInvokeError } from "@/lib/edgeFunctionError";
import { detectCareerKeywords } from "@/lib/careerDetection";
import { CareerRedirectPrompt } from "@/components/CareerRedirectPrompt";

interface TopicSuggestion {
  topic: string;
  whyForYou?: string;
  sourceCount: number;
  archetypeValue?: string;
}

const LearningPaths = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [paths, setPaths] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sourceCheckResult, setSourceCheckResult] = useState<{ count: number; sufficient: boolean } | null>(null);
  const [checkingSource, setCheckingSource] = useState(false);
  const [suggestedTopics, setSuggestedTopics] = useState<TopicSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showCareerRedirect, setShowCareerRedirect] = useState(false);

  useEffect(() => {
    if (user) {
      fetchPaths();
    }
  }, [user]);

  const fetchPaths = async () => {
    const { data, error } = await supabase
      .from("learning_paths")
      .select("*")
      .eq("user_id", user?.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching paths:", error);
    } else {
      setPaths(data || []);
    }
    setLoading(false);
  };

  const checkSources = async () => {
    if (!topic.trim()) return;
    
    if (detectCareerKeywords(topic)) {
      setShowCareerRedirect(true);
      return;
    }
    
    setCheckingSource(true);
    try {
      const topicWords = topic.toLowerCase()
        .replace(/[&\-\/\\]/g, ' ')
        .split(/\s+/)
        .filter((w: string) => w.length > 3 && !['with', 'that', 'this', 'from', 'about', 'your', 'the', 'and', 'for'].includes(w));
      
      const keywordConditions = topicWords.slice(0, 4).map((kw: string) => 
        `title.ilike.%${kw}%,content.ilike.%${kw}%`
      ).join(',');
      
      const docKeywordConditions = topicWords.slice(0, 4).map((kw: string) => 
        `title.ilike.%${kw}%,extracted_content.ilike.%${kw}%`
      ).join(',');

      const [insightsResult, documentsResult] = await Promise.all([
        supabase
          .from("insights")
          .select("id", { count: "exact" })
          .eq("user_id", user?.id)
          .or(keywordConditions || `title.ilike.%${topic}%,content.ilike.%${topic}%`),
        supabase
          .from("documents")
          .select("id", { count: "exact" })
          .eq("user_id", user?.id)
          .or(docKeywordConditions || `title.ilike.%${topic}%,extracted_content.ilike.%${topic}%`),
      ]);
      const count = (insightsResult.count || 0) + (documentsResult.count || 0);
      setSourceCheckResult({ count, sufficient: count >= 5 });
    } catch (error) {
      console.error("Error checking sources:", error);
    }
    setCheckingSource(false);
  };

  const generateTopicSuggestions = async () => {
    setLoadingSuggestions(true);
    setSuggestedTopics([]);
    setIsCreateOpen(true);
    try {
      const { data, error } = await supabase.functions.invoke("path-suggester", {
        body: {},
      });

      if (error) {
        console.error("Error generating suggestions:", error);
        toast.error("Failed to analyze your content");
        return;
      }

      if (data?.suggestionsWithDetails && data.suggestionsWithDetails.length > 0) {
        setSuggestedTopics(data.suggestionsWithDetails);
      } else if (data?.suggestionsWithCounts && data.suggestionsWithCounts.length > 0) {
        setSuggestedTopics(data.suggestionsWithCounts);
      } else if (data?.suggestions && data.suggestions.length > 0) {
        setSuggestedTopics(data.suggestions.map((s: string) => ({ topic: s, sourceCount: 5 })));
      } else if (data?.message) {
        toast.info(data.message);
      } else {
        toast.info("Save more content to get topic suggestions");
      }
    } catch (error) {
      console.error("Error generating suggestions:", error);
      toast.error("Failed to analyze your content");
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleCreate = async () => {
    if (!topic.trim() || !sourceCheckResult?.sufficient) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("learning-path-generator", {
        body: { topic: topic.trim(), durationDays: 30 },
      });

      if (error) {
        const parsed = parseFunctionInvokeError(error);
        toast.error(parsed.message);
        return;
      }

      if ((data as any)?.error === "career_topic") {
        toast.info((data as any).message, {
          action: {
            label: "Visit upath.ai",
            onClick: () => window.open((data as any).redirect_url, "_blank"),
          },
          duration: 8000,
        });
        return;
      }

      if ((data as any)?.error) {
        toast.error((data as any).message || (data as any).error);
        return;
      }

      toast.success("Learning path created");
      setIsCreateOpen(false);
      setTopic("");
      setSourceCheckResult(null);
      fetchPaths();
      if ((data as any)?.path?.id) navigate(`/learning-paths/${(data as any).path.id}`);
    } catch (error) {
      console.error("Error creating path:", error);
      toast.error("Failed to create learning path");
    } finally {
      setGenerating(false);
    }
  };

  const getProgress = (path: any) => {
    if (!path.duration_days || !path.current_day) return 0;
    return Math.round((path.current_day / path.duration_days) * 100);
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-primary/15 text-primary border-0 text-xs font-medium">
            <Play className="w-3 h-3 mr-1" /> Active
          </Badge>
        );
      case "paused":
        return (
          <Badge variant="secondary" className="text-xs">
            <Pause className="w-3 h-3 mr-1" /> Paused
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-green-500/15 text-green-600 border-0 text-xs font-medium">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Done
          </Badge>
        );
      default:
        return <Badge variant="secondary" className="text-xs">{status}</Badge>;
    }
  };

  const activePaths = paths.filter(p => p.status === "active");
  const otherPaths = paths.filter(p => p.status !== "active");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <BookOpen className="w-10 h-10 text-primary" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-3">Sprint Paths</h1>
      <p className="text-muted-foreground text-center max-w-md mb-2">
        Turn your saved insights into structured learning sprints.
      </p>
      <p className="text-sm text-muted-foreground/70">Coming soon</p>
    </div>
  );
};

export default LearningPaths;
