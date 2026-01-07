import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, BookOpen, Loader2, Play, Pause, CheckCircle2, Calendar, Target, Sparkles, ArrowRight, Layers, Zap, FileText, Lightbulb } from "lucide-react";
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
  const [contentStats, setContentStats] = useState({ insights: 0, documents: 0, topics: 0 });

  useEffect(() => {
    if (user) {
      fetchPaths();
      fetchContentStats();
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

  const fetchContentStats = async () => {
    const [insightsRes, docsRes, topicsRes] = await Promise.all([
      supabase.from("insights").select("id", { count: "exact" }).eq("user_id", user?.id),
      supabase.from("documents").select("id", { count: "exact" }).eq("user_id", user?.id),
      supabase.from("topics").select("id", { count: "exact" }).eq("user_id", user?.id),
    ]);
    setContentStats({
      insights: insightsRes.count || 0,
      documents: docsRes.count || 0,
      topics: topicsRes.count || 0,
    });
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
          <Badge className="bg-primary/15 text-primary border-0 text-[11px] font-medium">
            <Play className="w-3 h-3 mr-1" /> Active
          </Badge>
        );
      case "paused":
        return (
          <Badge variant="secondary" className="text-[11px]">
            <Pause className="w-3 h-3 mr-1" /> Paused
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-green-500/15 text-green-600 border-0 text-[11px] font-medium">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Done
          </Badge>
        );
      default:
        return <Badge variant="secondary" className="text-[11px]">{status}</Badge>;
    }
  };

  const activePaths = paths.filter(p => p.status === "active");
  const otherPaths = paths.filter(p => p.status !== "active");
  const totalContent = contentStats.insights + contentStats.documents;

  return (
    <>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Sprint Paths</h1>
            <p className="text-muted-foreground text-sm">
              Ship real deliverables in 3-7 days using your saved content
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={generateTopicSuggestions} 
              disabled={loadingSuggestions}
              className="gap-2"
            >
              {loadingSuggestions ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Suggest from content</span>
              <span className="sm:hidden">Suggest</span>
            </Button>
            <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Path</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </div>

        {/* Content Stats Banner */}
        {totalContent > 0 && paths.length === 0 && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-primary" />
                  <span><strong>{contentStats.insights}</strong> insights</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <span><strong>{contentStats.documents}</strong> docs</span>
                </div>
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <span><strong>{contentStats.topics}</strong> topics</span>
                </div>
              </div>
              <div className="sm:ml-auto">
                <Button size="sm" variant="outline" onClick={generateTopicSuggestions} className="gap-2">
                  <Zap className="w-4 h-4" />
                  Find patterns to sprint on
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : paths.length === 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Empty State Card */}
            <Card className="border-dashed md:col-span-2 lg:col-span-3">
              <CardContent className="py-12 text-center">
                <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg mb-2">What do you want to ship?</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                  Sprint paths turn your saved content into 3-7 day projects with real deliverables. 
                  Pick a topic you've been saving about.
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-3">
                  <Button onClick={generateTopicSuggestions} variant="outline" className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    Suggest from my content
                  </Button>
                  <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Choose a topic
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Active Paths */}
            {activePaths.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Sprints</h2>
                  <Badge variant="secondary" className="text-[10px]">{activePaths.length}</Badge>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {activePaths.map(path => (
                    <Card 
                      key={path.id} 
                      className="cursor-pointer group hover:shadow-lg hover:border-primary/40 transition-all duration-200" 
                      onClick={() => navigate(`/learning-paths/${path.id}`)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                              {path.topic_name || path.title}
                            </CardTitle>
                            {path.description && (
                              <CardDescription className="mt-1.5 line-clamp-2 text-xs">
                                {path.description}
                              </CardDescription>
                            )}
                          </div>
                          {getStatusBadge(path.status)}
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-4">
                        {/* Progress */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5" />
                              Day {path.current_day} of {path.duration_days}
                            </span>
                            <span className="font-medium">{getProgress(path)}%</span>
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
                              <Badge key={i} variant="outline" className="text-[10px] font-normal px-2 py-0.5">
                                {t}
                              </Badge>
                            ))}
                            {path.sub_topics.length > 3 && (
                              <Badge variant="outline" className="text-[10px] font-normal px-2 py-0.5 text-muted-foreground">
                                +{path.sub_topics.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Continue CTA */}
                        <div className="pt-1">
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
                  <Badge variant="secondary" className="text-[10px]">{otherPaths.length}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {otherPaths.map(path => (
                    <Card 
                      key={path.id} 
                      className="cursor-pointer group hover:shadow-md hover:border-primary/30 transition-all duration-200" 
                      onClick={() => navigate(`/learning-paths/${path.id}`)}
                    >
                      <CardContent className="py-4 px-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 space-y-1">
                            <h3 className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                              {path.topic_name || path.title}
                            </h3>
                            <p className="text-[11px] text-muted-foreground">
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

        {/* Create Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg">What do you want to ship?</DialogTitle>
              <DialogDescription className="text-sm">
                Pick a topic from your saved content. We'll create a 3-7 day sprint with real deliverables.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 pt-2">
              <div className="space-y-2">
                <Label className="text-sm">Topic</Label>
                <Input 
                  placeholder="e.g., Cold outreach, Landing pages, Video editing..." 
                  value={topic} 
                  onChange={(e) => { setTopic(e.target.value); setSourceCheckResult(null); }} 
                  onBlur={checkSources}
                  className="h-10"
                />
              </div>

              {/* AI Suggestions */}
              {suggestedTopics.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Patterns in your content
                  </p>
                  <div className="space-y-2">
                    {suggestedTopics.map((s) => (
                      <button 
                        key={s.topic}
                        className="w-full text-left p-3 rounded-lg border hover:border-primary/50 hover:bg-primary/5 transition-all group"
                        onClick={() => { 
                          setTopic(s.topic); 
                          setSuggestedTopics([]); 
                          setSourceCheckResult({ count: s.sourceCount, sufficient: true });
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <p className="font-medium text-sm group-hover:text-primary transition-colors">
                              {s.topic}
                            </p>
                            {s.whyForYou && (
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {s.whyForYou}
                              </p>
                            )}
                          </div>
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            {s.sourceCount} sources
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {loadingSuggestions && (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing your saved content...
                </div>
              )}

              {checkingSource && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking your saved sources...
                </div>
              )}

              {sourceCheckResult && (
                <div className={`p-3 rounded-lg text-sm ${
                  sourceCheckResult.sufficient 
                    ? "bg-green-500/10 text-green-700 dark:text-green-400" 
                    : "bg-destructive/10 text-destructive"
                }`}>
                  {sourceCheckResult.sufficient 
                    ? `Found ${sourceCheckResult.count} sources about "${topic}". Ready to create your sprint.`
                    : `Only found ${sourceCheckResult.count} sources about "${topic}". Save at least 5 sources first.`
                  }
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreate} 
                  disabled={!sourceCheckResult?.sufficient || generating}
                  className="gap-2"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      Create Sprint
                    </>
                  )}
                </Button>
              </div>
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
    </>
  );
};

export default LearningPaths;
