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
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-background to-accent/5 border border-border/50 p-6 sm:p-8">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <BookOpen className="h-7 w-7 text-primary" />
              Sprint Paths
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Turn saved insights into structured learning sprints. Each path produces real deliverables in 3-7 days.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button 
              variant="outline" 
              size="default"
              onClick={generateTopicSuggestions} 
              disabled={loadingSuggestions}
              className="h-10"
            >
              {loadingSuggestions ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Suggest
            </Button>
            <Button size="default" onClick={() => setIsCreateOpen(true)} className="h-10">
              <Plus className="w-4 h-4 mr-2" />
              New Path
            </Button>
          </div>
        </div>
        {/* Subtle decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : paths.length === 0 ? (
        <Card className="border-dashed border-2 bg-muted/20">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Zap className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-semibold text-xl mb-3">What do you want to master?</h3>
            <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
              Sprint paths analyze saved insights and documents to create personalized learning experiences. 
              Each sprint produces something tangible you can use or share.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <Button onClick={generateTopicSuggestions} variant="outline" size="lg" className="gap-2">
                <Sparkles className="w-4 h-4" />
                Find patterns in content
              </Button>
              <Button onClick={() => setIsCreateOpen(true)} size="lg" className="gap-2">
                <Plus className="w-4 h-4" />
                Choose a topic
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Active Paths */}
          {activePaths.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Sprints</h2>
                <Badge variant="secondary" className="text-xs">{activePaths.length}</Badge>
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {activePaths.map(path => (
                  <Card 
                    key={path.id} 
                    className="rounded-[10px] border-border/30 hover:shadow-lg hover:border-primary/50 transition-all duration-200 cursor-pointer group" 
                    onClick={() => navigate(`/learning-paths/${path.id}`)}
                  >
                    <CardContent className="pt-5 pb-5">
                      <div className="flex flex-col gap-4">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-base leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                              {path.topic_name || path.title}
                            </h3>
                            {path.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {path.description}
                              </p>
                            )}
                          </div>
                          {getStatusBadge(path.status)}
                        </div>

                        {/* Progress */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5" />
                              Day {path.current_day} of {path.duration_days}
                            </span>
                            <span className="font-medium text-foreground">{getProgress(path)}%</span>
                          </div>
                          <Progress value={getProgress(path)} className="h-1.5" />
                        </div>

                        {/* Final Deliverable */}
                        {path.final_deliverable && (
                          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2.5">
                            <Target className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
                            <span className="line-clamp-2">{path.final_deliverable}</span>
                          </div>
                        )}

                        {/* Sub-topics */}
                        {path.sub_topics && Array.isArray(path.sub_topics) && path.sub_topics.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {path.sub_topics.slice(0, 3).map((t: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs font-normal">
                                {t}
                              </Badge>
                            ))}
                            {path.sub_topics.length > 3 && (
                              <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                                +{path.sub_topics.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* CTA */}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="w-full justify-between text-xs h-8 group-hover:bg-primary/10 group-hover:text-primary"
                        >
                          Continue sprint
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Past Paths */}
          {otherPaths.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  {activePaths.length > 0 ? "Past Sprints" : "All Sprints"}
                </h2>
                <Badge variant="secondary" className="text-xs">{otherPaths.length}</Badge>
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {otherPaths.map(path => (
                  <Card 
                    key={path.id} 
                    className="rounded-[10px] border-border/30 hover:shadow-lg hover:border-primary/50 transition-all duration-200 cursor-pointer group" 
                    onClick={() => navigate(`/learning-paths/${path.id}`)}
                  >
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <h3 className="font-medium text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                            {path.topic_name || path.title}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {path.duration_days} days · {getProgress(path)}% complete
                          </p>
                        </div>
                        {getStatusBadge(path.status)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Create Dialog - Enhanced */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">Create a Sprint Path</DialogTitle>
            <DialogDescription className="text-base">
              Pick a topic from saved content. Related insights will be analyzed to create a focused learning sprint.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 pt-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Topic</Label>
              <Input 
                placeholder="e.g., Cold outreach, Landing pages, Video editing..." 
                value={topic} 
                onChange={(e) => { setTopic(e.target.value); setSourceCheckResult(null); }} 
                onBlur={checkSources}
                className="h-11"
              />
            </div>

            {/* AI Suggestions - Enhanced */}
            {suggestedTopics.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Patterns detected
                </p>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {suggestedTopics.map((s) => (
                    <button 
                      key={s.topic}
                      className="w-full text-left p-4 rounded-xl border-2 border-transparent bg-muted/50 hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 group"
                      onClick={() => { 
                        setTopic(s.topic); 
                        setSuggestedTopics([]); 
                        setSourceCheckResult({ count: s.sourceCount, sufficient: true });
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-1">
                          <span className="font-medium group-hover:text-primary transition-colors block">{s.topic}</span>
                          {s.whyForYou && (
                            <span className="text-xs text-muted-foreground block leading-relaxed">{s.whyForYou}</span>
                          )}
                        </div>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {s.sourceCount} sources
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loadingSuggestions && suggestedTopics.length === 0 && (
              <div className="text-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary mb-3" />
                <p className="text-sm text-muted-foreground">Analyzing content for patterns...</p>
              </div>
            )}

            {checkingSource && (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Searching content...
              </p>
            )}

            {sourceCheckResult && (
              <div className={`p-3 rounded-xl text-sm ${sourceCheckResult.sufficient ? 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'}`}>
                Found <strong>{sourceCheckResult.count}</strong> related sources
                {sourceCheckResult.sufficient ? ` — ready to create sprint` : ' (need at least 5)'}
              </div>
            )}

            <Button 
              className="w-full h-11" 
              onClick={handleCreate} 
              disabled={!topic.trim() || !sourceCheckResult?.sufficient || generating}
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Creating personalized path...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Create Sprint Path
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Career Redirect */}
      <CareerRedirectPrompt
        open={showCareerRedirect}
        onOpenChange={setShowCareerRedirect}
        onContinue={() => {
          setShowCareerRedirect(false);
          checkSources();
        }}
      />
    </div>
  );
};

export default LearningPaths;
