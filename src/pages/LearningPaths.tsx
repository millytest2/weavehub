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
import { Plus, BookOpen, Loader2, Play, Pause, CheckCircle2, Calendar, Target, Sparkles } from "lucide-react";
import { parseFunctionInvokeError } from "@/lib/edgeFunctionError";
import { detectCareerKeywords } from "@/lib/careerDetection";
import { CareerRedirectPrompt } from "@/components/CareerRedirectPrompt";

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
  const [suggestedTopics, setSuggestedTopics] = useState<{topic: string; sourceCount: number}[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showCareerRedirect, setShowCareerRedirect] = useState(false);

  useEffect(() => {
    if (user) fetchPaths();
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
    
    // Check for career keywords first
    if (detectCareerKeywords(topic)) {
      setShowCareerRedirect(true);
      return;
    }
    
    setCheckingSource(true);
    try {
      // Extract keywords from topic for broader matching (same logic as learning-path-generator)
      const topicWords = topic.toLowerCase()
        .replace(/[&\-\/\\]/g, ' ')
        .split(/\s+/)
        .filter((w: string) => w.length > 3 && !['with', 'that', 'this', 'from', 'about', 'your', 'the', 'and', 'for'].includes(w));
      
      // Build OR conditions for each keyword
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
    setIsCreateOpen(true); // Open dialog immediately
    try {
      const { data, error } = await supabase.functions.invoke("path-suggester", {
        body: {},
      });

      if (error) {
        console.error("Error generating suggestions:", error);
        toast.error("Failed to analyze your content");
        return;
      }

      if (data?.suggestionsWithCounts && data.suggestionsWithCounts.length > 0) {
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

      // Handle career topic redirect
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
          <Badge variant="default" className="bg-primary/20 text-primary border-0">
            <Play className="w-3 h-3 mr-1" /> Active
          </Badge>
        );
      case "paused":
        return (
          <Badge variant="secondary">
            <Pause className="w-3 h-3 mr-1" /> Paused
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="outline" className="bg-green-500/20 text-green-600 border-0">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Completed
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const activePaths = paths.filter(p => p.status === "active");
  const otherPaths = paths.filter(p => p.status !== "active");

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 px-1 sm:px-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold">Learning Paths</h1>
            <p className="text-muted-foreground text-xs sm:text-sm">30-day structured learning from your saved sources</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={generateTopicSuggestions} disabled={loadingSuggestions}>
              {loadingSuggestions ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 sm:mr-2" />}
              <span className="hidden sm:inline">{loadingSuggestions ? "" : "Suggest"}</span>
            </Button>
            <Button size="sm" className="flex-1 sm:flex-none" onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Start Path</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : paths.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <BookOpen className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">What pattern are you noticing in your saved content?</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                Name the topic that keeps appearing and let your sources guide you.
              </p>
              <div className="flex justify-center gap-2">
                <Button onClick={() => setIsCreateOpen(true)}><Plus className="w-4 h-4 mr-2" /> Start Learning Path</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {activePaths.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Active</h2>
                {activePaths.map(path => (
                  <Card key={path.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/learning-paths/${path.id}`)}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{path.topic_name || path.title}</CardTitle>
                          <CardDescription className="mt-1">{path.description}</CardDescription>
                        </div>
                        {getStatusBadge(path.status)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Day {path.current_day} of {path.duration_days}</span>
                          {path.final_deliverable && <span className="flex items-center gap-1 line-clamp-1"><Target className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> {path.final_deliverable}</span>}
                        </div>
                        <Progress value={getProgress(path)} className="h-2" />
                        {path.sub_topics && Array.isArray(path.sub_topics) && path.sub_topics.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {path.sub_topics.slice(0, 4).map((t: string, i: number) => <Badge key={i} variant="outline" className="text-xs font-normal">{t}</Badge>)}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {otherPaths.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{activePaths.length > 0 ? "Past Paths" : "All Paths"}</h2>
                <div className="grid gap-3">
                  {otherPaths.map(path => (
                    <Card key={path.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/learning-paths/${path.id}`)}>
                      <CardHeader className="py-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base">{path.topic_name || path.title}</CardTitle>
                            <CardDescription className="text-xs mt-0.5">{path.duration_days} days · {getProgress(path)}% complete</CardDescription>
                          </div>
                          {getStatusBadge(path.status)}
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>What topic keeps appearing in your saved content?</DialogTitle>
              <DialogDescription>You've been saving sources about something. Name the pattern you're noticing and let your own sources guide a 30-day path.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>What do you want to learn?</Label>
                <Input placeholder="e.g., Quantum Physics, Decision Science, Charisma..." value={topic} onChange={(e) => { setTopic(e.target.value); setSourceCheckResult(null); }} onBlur={checkSources} />
              </div>
              {suggestedTopics.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <span className="text-sm text-muted-foreground">Patterns in your content:</span>
                  {suggestedTopics.map((s) => (
                    <Badge 
                      key={s.topic} 
                      variant="secondary" 
                      className="cursor-pointer hover:bg-primary/20"
                      onClick={() => { 
                        setTopic(s.topic); 
                        setSuggestedTopics([]); 
                        // Auto-validate since path-suggester already confirmed 5+ sources
                        setSourceCheckResult({ count: s.sourceCount, sufficient: true });
                      }}
                    >
                      {s.topic}
                    </Badge>
                  ))}
                </div>
              )}
              {checkingSource && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Checking your saved sources...</div>}
              {sourceCheckResult && (
                <div className={`p-3 rounded-lg text-sm ${sourceCheckResult.sufficient ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"}`}>
                  {sourceCheckResult.sufficient ? `Found ${sourceCheckResult.count} sources about "${topic}". Ready to create your path.` : `Only found ${sourceCheckResult.count} sources about "${topic}". Save at least 5 sources first.`}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={!sourceCheckResult?.sufficient || generating}>
                  {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating Path...</> : "Create 30-Day Path"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <CareerRedirectPrompt 
          open={showCareerRedirect} 
          onOpenChange={setShowCareerRedirect}
          onContinue={() => {
            setShowCareerRedirect(false);
            // Proceed with source check after dismissing - use keyword extraction
            setCheckingSource(true);
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

            Promise.all([
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
            ]).then(([insightsResult, documentsResult]) => {
              const count = (insightsResult.count || 0) + (documentsResult.count || 0);
              setSourceCheckResult({ count, sufficient: count >= 5 });
              setCheckingSource(false);
            });
          }}
        />
      </div>
    </>
  );
};

export default LearningPaths;
