import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Circle,
  Play,
  Pause,
  ChevronDown,
  BookOpen,
  Target,
  Calendar,
  Coffee,
  RefreshCw,
  Trash2,
  Trophy,
  ExternalLink,
  RotateCcw,
  Rocket,
  ChevronRight,
  Eye,
  EyeOff,
  Zap,
  Clock,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Json } from "@/integrations/supabase/types";
import { PathCompletionDialog } from "@/components/dashboard/PathCompletionDialog";
import { parseFunctionInvokeError } from "@/lib/edgeFunctionError";

interface DailyProgress {
  id: string;
  day_number: number;
  learning_task: string | null;
  learning_source_ref: string | null;
  learning_completed: boolean;
  application_task: string | null;
  application_completed: boolean;
  is_rest_day: boolean;
  completed_at: string | null;
}

interface Section {
  section_number: number;
  title: string;
  days: number[];
  objective: string;
  key_understanding: string;
  sources_used: string[];
  section_deliverable: string;
}

interface PathStructure {
  sections?: Section[];
  daily_structure?: unknown[];
}

interface LearningPath {
  id: string;
  title: string;
  description: string | null;
  topic_name: string | null;
  duration_days: number | null;
  current_day: number | null;
  status: string | null;
  sub_topics: Json | null;
  final_deliverable: string | null;
  started_at: string | null;
  completed_at: string | null;
  sources_used: Json | null;
  structure: PathStructure | null;
}

const LearningPathDetail = () => {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [path, setPath] = useState<LearningPath | null>(null);
  const [dailyProgress, setDailyProgress] = useState<DailyProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [openWeeks, setOpenWeeks] = useState<number[]>([]);
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completedInsightId, setCompletedInsightId] = useState<string | null>(null);
  const [legacyPathError, setLegacyPathError] = useState<string | null>(null);
  const [recreating, setRecreating] = useState(false);
  const [openingSource, setOpeningSource] = useState<string | null>(null);
  const [showFullSchedule, setShowFullSchedule] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (user && id) fetchPath();
  }, [user, id]);

  const fetchPath = async () => {
    const [pathResult, progressResult] = await Promise.all([
      supabase
        .from("learning_paths")
        .select("*")
        .eq("id", id)
        .eq("user_id", user?.id)
        .single(),
      supabase
        .from("path_daily_progress")
        .select("*")
        .eq("path_id", id)
        .order("day_number", { ascending: true }),
    ]);

    if (pathResult.error) {
      console.error("Error fetching path:", pathResult.error);
      toast.error("Path not found");
      navigate("/learning-paths");
      return;
    }

    // Cast structure from Json to our PathStructure type
    const pathData = {
      ...pathResult.data,
      structure: pathResult.data.structure as PathStructure | null,
    };

    setPath(pathData);
    setDailyProgress(progressResult.data || []);
    setLoading(false);
  };

  const handleStartSprint = async () => {
    if (!path) return;
    setStarting(true);
    
    try {
      const { error } = await supabase
        .from("learning_paths")
        .update({ 
          started_at: new Date().toISOString(),
          current_day: 1,
          status: "active"
        })
        .eq("id", path.id);
      
      if (error) throw error;
      
      setPath(prev => prev ? { 
        ...prev, 
        started_at: new Date().toISOString(),
        current_day: 1,
        status: "active"
      } : null);
      
      toast.success("Sprint started! Let's go 🚀");
    } catch (error) {
      console.error("Error starting sprint:", error);
      toast.error("Failed to start sprint");
    } finally {
      setStarting(false);
    }
  };

  const markComplete = async (
    progressId: string,
    field: "learning_completed" | "application_completed",
    value: boolean
  ) => {
    setUpdating(progressId);

    const dayProgress = dailyProgress.find((d) => d.id === progressId);
    if (!dayProgress) return;

    const updates: Record<string, unknown> = { [field]: value };

    const otherField = field === "learning_completed" ? "application_completed" : "learning_completed";
    const otherValue = dayProgress[otherField];

    if (value && otherValue) {
      updates.completed_at = new Date().toISOString();
    } else if (!value) {
      updates.completed_at = null;
    }

    const { error } = await supabase.from("path_daily_progress").update(updates).eq("id", progressId);

    if (error) {
      console.error("Error updating progress:", error);
      toast.error("Failed to update");
    } else {
      setDailyProgress((prev) => prev.map((d) => (d.id === progressId ? ({ ...d, ...updates } as DailyProgress) : d)));

      if (value && otherValue && path) {
        const completedDays = dailyProgress.filter((d) => (d.id === progressId ? true : d.learning_completed && d.application_completed)).length;

        if (completedDays > (path.current_day || 0)) {
          await supabase.from("learning_paths").update({ current_day: completedDays }).eq("id", path.id);
          setPath((prev) => (prev ? { ...prev, current_day: completedDays } : null));
        }
      }
    }

    setUpdating(null);
  };

  const markRestDayComplete = async (progressId: string) => {
    setUpdating(progressId);

    const { error } = await supabase
      .from("path_daily_progress")
      .update({
        learning_completed: true,
        application_completed: true,
        completed_at: new Date().toISOString(),
      })
      .eq("id", progressId);

    if (error) {
      toast.error("Failed to update");
    } else {
      setDailyProgress((prev) =>
        prev.map((d) =>
          d.id === progressId
            ? {
                ...d,
                learning_completed: true,
                application_completed: true,
                completed_at: new Date().toISOString(),
              }
            : d
        )
      );
    }

    setUpdating(null);
  };

  const toggleStatus = async () => {
    if (!path) return;

    const newStatus = path.status === "active" ? "paused" : "active";

    const { error } = await supabase.from("learning_paths").update({ status: newStatus }).eq("id", path.id);

    if (error) {
      toast.error("Failed to update status");
    } else {
      setPath((prev) => (prev ? { ...prev, status: newStatus } : null));
      toast.success(newStatus === "paused" ? "Path paused" : "Path resumed");
    }
  };

  const handleRegenerate = async () => {
    if (!path) return;
    setRegenerating(true);
    setLegacyPathError(null);

    try {
      const { data, error } = await supabase.functions.invoke("learning-path-generator", {
        body: {
          topic: path.topic_name || path.title,
          durationDays: path.duration_days || 30,
          regenerate: true,
          pathId: path.id,
        },
      });

      if (error) {
        const parsed = parseFunctionInvokeError(error);
        if (parsed.code === "legacy_path") {
          setLegacyPathError(parsed.message);
        }
        toast.error(parsed.message);
        return;
      }

      if ((data as any)?.error) {
        const code = (data as any).error as string | undefined;
        const message = (data as any).message || code || "Failed to regenerate path";
        if (code === "legacy_path") setLegacyPathError(message);
        toast.error(message);
        return;
      }

      toast.success("Path regenerated with fresh structure");
      fetchPath();
    } catch (err) {
      console.error("Error regenerating path:", err);
      toast.error("Failed to regenerate path");
    } finally {
      setRegenerating(false);
    }
  };

  const handleRecreatePath = async () => {
    if (!path) return;
    setRecreating(true);
    try {
      const topicName = path.topic_name || path.title;
      const { data, error } = await supabase.functions.invoke("learning-path-generator", {
        body: { topic: topicName, durationDays: Math.min(path.duration_days || 14, 14) },
      });

      if (error) {
        const parsed = parseFunctionInvokeError(error);
        toast.error(parsed.message);
        return;
      }

      if ((data as any)?.error) {
        toast.error((data as any).message || "Failed to create new path");
        return;
      }

      await supabase.from("learning_paths").delete().eq("id", path.id);

      toast.success("New path created from your latest sources");
      if ((data as any)?.path?.id) {
        navigate(`/learning-paths/${(data as any).path.id}`);
      } else {
        navigate("/learning-paths");
      }
    } catch (err) {
      console.error("Error recreating path:", err);
      toast.error("Failed to recreate path");
    } finally {
      setRecreating(false);
    }
  };

  const handleDelete = async () => {
    if (!path) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("learning_paths").delete().eq("id", path.id);

      if (error) throw error;
      toast.success("Path deleted");
      navigate("/learning-paths");
    } catch (error) {
      console.error("Error deleting path:", error);
      toast.error("Failed to delete path");
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenSource = async (source: { id: string; title: string; type: string }) => {
    setOpeningSource(source.id);
    
    const cleanId = source.id.replace(/^(insight|document)-/, '');
    
    try {
      const isDocument = source.type === "document" || source.id.startsWith("document-");
      
      if (isDocument) {
        const { data: doc } = await supabase
          .from("documents")
          .select("file_path, extracted_content")
          .eq("id", cleanId)
          .single();
        
        if (doc?.file_path) {
          const { data: urlData } = await supabase.storage
            .from("documents")
            .createSignedUrl(doc.file_path, 3600);
          
          if (urlData?.signedUrl) {
            window.open(urlData.signedUrl, "_blank");
          } else {
            toast.error("Could not access document file");
          }
        } else {
          toast(source.title, { description: doc?.extracted_content?.slice(0, 200) + "..." });
        }
      } else {
        const { data: insight } = await supabase
          .from("insights")
          .select("source, content")
          .eq("id", cleanId)
          .single();
        
        if (!insight) {
          toast(source.title, { description: "Source not found in database" });
          return;
        }
        
        if (source.type.startsWith("youtube:")) {
          const videoId = source.type.replace("youtube:", "");
          window.open(`https://youtube.com/watch?v=${videoId}`, "_blank");
        } else if (insight.source && (insight.source.startsWith("http") || insight.source.startsWith("www"))) {
          const url = insight.source.startsWith("http") ? insight.source : `https://${insight.source}`;
          window.open(url, "_blank");
        } else {
          toast(source.title, { 
            description: insight.content?.slice(0, 200) + (insight.content && insight.content.length > 200 ? "..." : ""),
            duration: 10000
          });
        }
      }
    } catch (error) {
      console.error("Error opening source:", error);
      toast.error("Could not open source");
    } finally {
      setOpeningSource(null);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (!path) return null;

  const completedDays = dailyProgress.filter((d) => d.learning_completed && d.application_completed).length;
  const progress = path.duration_days ? Math.round((completedDays / path.duration_days) * 100) : 0;
  const isPathComplete = path.duration_days ? completedDays >= path.duration_days : false;
  const isAlreadyCodified = path.status === "completed" && path.completed_at;
  const hasStarted = path.started_at !== null;
  const currentDay = dailyProgress.find((d) => !d.learning_completed || !d.application_completed);

  // Group by weeks
  const weeks: DailyProgress[][] = [];
  for (let i = 0; i < dailyProgress.length; i += 7) {
    weeks.push(dailyProgress.slice(i, i + 7));
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Minimal Back Button */}
        <Button variant="ghost" size="sm" onClick={() => navigate("/learning-paths")} className="mb-2 -ml-2">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        {/* === GETTING STARTED STATE === */}
        {!hasStarted && (
          <div className="space-y-6">
            {/* Welcome Card */}
            <Card className="border-primary/50 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent overflow-hidden">
              <CardContent className="pt-8 pb-8">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto">
                    <Rocket className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold mb-2">{path.topic_name || path.title}</h1>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      Your {path.duration_days}-day learning sprint is ready. Here's what you'll accomplish:
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* What You'll Create */}
            {path.final_deliverable && (
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardContent className="py-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                      <Target className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-amber-600 uppercase tracking-wide mb-1">Final Deliverable</p>
                      <p className="font-medium">{path.final_deliverable}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* The Rhythm */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">How This Works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                      <BookOpen className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Learn (15 min)</p>
                      <p className="text-xs text-muted-foreground">Review a concept from your saved sources</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Apply (15 min)</p>
                      <p className="text-xs text-muted-foreground">Immediately use what you learned</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
                      <Coffee className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Rest (every 5th day)</p>
                      <p className="text-xs text-muted-foreground">Let concepts integrate naturally</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
                  <Clock className="w-4 h-4" />
                  <span>~30 minutes per day</span>
                </div>
              </CardContent>
            </Card>

            {/* Sections Preview (new structure) OR Topics Preview (legacy) */}
            {path.structure?.sections && path.structure.sections.length > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Your Sprint Sections</CardTitle>
                  <CardDescription>Clear milestones with tangible deliverables</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {path.structure.sections.map((section, i) => (
                    <div key={i} className="p-4 rounded-lg bg-muted/50 border border-border/50">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-sm font-bold text-primary">
                          {section.section_number}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{section.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Days {section.days[0]}-{section.days[section.days.length - 1]} • {section.objective}
                          </p>
                          {section.section_deliverable && (
                            <div className="mt-2 flex items-center gap-1.5 text-xs text-primary">
                              <Target className="w-3 h-3" />
                              {section.section_deliverable}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : path.sub_topics && Array.isArray(path.sub_topics) && path.sub_topics.length > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Topics You'll Master</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {(path.sub_topics as string[]).map((t, i) => (
                      <Badge key={i} variant="secondary" className="text-sm font-normal">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* Start Button */}
            <Button 
              size="lg" 
              className="w-full h-14 text-lg gap-3" 
              onClick={handleStartSprint}
              disabled={starting}
            >
              {starting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Start Day 1
                </>
              )}
            </Button>

            {/* Quick Actions */}
            <div className="flex justify-center gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-muted-foreground">
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Learning Path</AlertDialogTitle>
                    <AlertDialogDescription>This will permanently delete this learning path.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}

        {/* === ACTIVE SPRINT STATE === */}
        {hasStarted && (
          <>
            {/* Compact Header */}
            <Card className="border-border/50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h1 className="font-semibold text-lg truncate">{path.topic_name || path.title}</h1>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm text-muted-foreground">
                        Day {completedDays}/{path.duration_days}
                      </span>
                      <Progress value={progress} className="h-1.5 w-24" />
                      <span className="text-sm font-medium">{progress}%</span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleStatus}>
                      {path.status === "active" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRegenerate} disabled={regenerating || !!legacyPathError}>
                      {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Learning Path</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently delete this learning path and all progress.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Legacy Path Error */}
            {legacyPathError && (
              <Card className="border-amber-500/50 bg-amber-500/5">
                <CardContent className="py-4">
                  <p className="text-sm text-muted-foreground mb-3">{legacyPathError}</p>
                  <Button size="sm" onClick={handleRecreatePath} disabled={recreating}>
                    {recreating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RotateCcw className="w-4 h-4 mr-1" />}
                    Recreate with Latest Sources
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Path Complete Celebration */}
            {isPathComplete && !isAlreadyCodified && (
              <Card className="border-primary bg-primary/5">
                <CardContent className="py-6 text-center">
                  <Trophy className="w-10 h-10 mx-auto text-primary mb-3" />
                  <p className="text-lg font-semibold mb-1">You completed {path.topic_name || path.title}!</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    {path.duration_days} days of focused learning. Now lock in what you learned.
                  </p>
                  <Button onClick={() => setCompletionDialogOpen(true)}>
                    Codify Your Learnings
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Already Codified */}
            {isAlreadyCodified && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Trophy className="w-6 h-6 text-primary" />
                    <div>
                      <p className="font-medium">Path Completed</p>
                      <p className="text-sm text-muted-foreground">Learnings codified and saved</p>
                    </div>
                  </div>
                  {completedInsightId && (
                    <Button variant="outline" size="sm" onClick={() => navigate(`/insights`)}>
                      <ExternalLink className="w-4 h-4 mr-1" />
                      View Insight
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Completion Dialog */}
            <PathCompletionDialog
              open={completionDialogOpen}
              onOpenChange={setCompletionDialogOpen}
              pathId={path.id}
              topicName={path.topic_name || path.title}
              durationDays={path.duration_days || 30}
              subTopics={(path.sub_topics as string[]) || []}
              finalDeliverable={path.final_deliverable}
              sourcesUsed={(path.sources_used as { id: string; title: string; type: string }[]) || []}
              onComplete={(insightId) => {
                setCompletedInsightId(insightId);
                setPath(prev => prev ? { ...prev, status: "completed", completed_at: new Date().toISOString() } : null);
              }}
            />

            {/* === TODAY'S FOCUS (Main Focus Area) === */}
            {currentDay && !currentDay.is_rest_day && !isPathComplete && (
              <Card className="border-primary/50 shadow-lg">
                <CardHeader className="pb-3 bg-gradient-to-r from-primary/10 to-transparent rounded-t-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-primary uppercase tracking-wider mb-1">Your Focus Today</p>
                      <CardTitle className="text-xl flex items-center gap-2">
                        Day {currentDay.day_number}
                      </CardTitle>
                    </div>
                    <Badge variant="outline" className="text-sm">~30 min</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-5 space-y-4">
                  {/* Learning Task */}
                  <div 
                    className={`p-4 rounded-xl border-2 transition-all ${
                      currentDay.learning_completed 
                        ? "bg-primary/5 border-primary/30" 
                        : "bg-background border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <button
                        onClick={() => markComplete(currentDay.id, "learning_completed", !currentDay.learning_completed)}
                        disabled={updating === currentDay.id}
                        className="mt-1 shrink-0"
                      >
                        {currentDay.learning_completed ? (
                          <CheckCircle2 className="w-6 h-6 text-primary" />
                        ) : (
                          <Circle className="w-6 h-6 text-muted-foreground hover:text-primary transition-colors" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <BookOpen className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium text-primary">Learn</span>
                          <span className="text-xs text-muted-foreground">15 min</span>
                        </div>
                        <p className={`text-base ${currentDay.learning_completed ? "text-muted-foreground line-through" : ""}`}>
                          {currentDay.learning_task}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Arrow indicator */}
                  <div className="flex justify-center">
                    <ChevronRight className="w-5 h-5 text-muted-foreground rotate-90" />
                  </div>

                  {/* Application Task */}
                  <div 
                    className={`p-4 rounded-xl border-2 transition-all ${
                      currentDay.application_completed 
                        ? "bg-amber-500/5 border-amber-500/30" 
                        : "bg-background border-border hover:border-amber-500/50"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <button
                        onClick={() => markComplete(currentDay.id, "application_completed", !currentDay.application_completed)}
                        disabled={updating === currentDay.id}
                        className="mt-1 shrink-0"
                      >
                        {currentDay.application_completed ? (
                          <CheckCircle2 className="w-6 h-6 text-amber-600" />
                        ) : (
                          <Circle className="w-6 h-6 text-muted-foreground hover:text-amber-600 transition-colors" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap className="w-4 h-4 text-amber-600" />
                          <span className="text-sm font-medium text-amber-600">Apply</span>
                          <span className="text-xs text-muted-foreground">15 min</span>
                        </div>
                        <p className={`text-base ${currentDay.application_completed ? "text-muted-foreground line-through" : ""}`}>
                          {currentDay.application_task}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Rest Day */}
            {currentDay && currentDay.is_rest_day && !isPathComplete && (
              <Card className="border-green-500/50 bg-green-500/5">
                <CardContent className="py-8 text-center">
                  <Coffee className="w-10 h-10 mx-auto text-green-600 mb-3" />
                  <p className="text-xl font-medium mb-2">Day {currentDay.day_number} — Rest</p>
                  <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                    Let yesterday's concepts integrate. Your brain is still learning even when you rest.
                  </p>
                  <Button 
                    size="lg"
                    onClick={() => markRestDayComplete(currentDay.id)}
                    disabled={updating === currentDay.id}
                  >
                    {updating === currentDay.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Complete Rest Day
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Toggle Full Schedule */}
            <Button
              variant="ghost"
              className="w-full justify-between text-muted-foreground hover:text-foreground"
              onClick={() => setShowFullSchedule(!showFullSchedule)}
            >
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {showFullSchedule ? "Hide" : "View"} Full {path.duration_days}-Day Schedule
              </span>
              {showFullSchedule ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>

            {/* Full Schedule (Hidden by Default) */}
            {showFullSchedule && (
              <div className="space-y-3">
                {dailyProgress.length === 0 ? (
                  <Card>
                    <CardContent className="py-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        This path doesn't have a generated schedule yet.
                      </p>
                      <div className="mt-3 flex justify-center gap-2">
                        <Button size="sm" variant="secondary" onClick={() => navigate("/learning-paths")}>
                          Create a new path
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleRegenerate} disabled={regenerating || !!legacyPathError}>
                          {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Try regenerate"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  weeks.map((week, weekIndex) => {
                    const weekNum = weekIndex + 1;
                    const weekCompleted = week.every(d => d.learning_completed && d.application_completed);
                    const isOpen = openWeeks.includes(weekNum);

                    return (
                      <Collapsible
                        key={weekNum}
                        open={isOpen}
                        onOpenChange={(open) => {
                          setOpenWeeks(prev => open ? [...prev, weekNum] : prev.filter(w => w !== weekNum));
                        }}
                      >
                        <CollapsibleTrigger asChild>
                          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <CardHeader className="py-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {weekCompleted ? (
                                    <CheckCircle2 className="w-4 h-4 text-primary" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-muted-foreground" />
                                  )}
                                  <span className="font-medium">Week {weekNum}</span>
                                  <span className="text-sm text-muted-foreground">
                                    Days {week[0].day_number}-{week[week.length - 1].day_number}
                                  </span>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                              </div>
                            </CardHeader>
                          </Card>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="pl-4 border-l-2 border-muted ml-4 mt-2 space-y-2">
                            {week.map(day => (
                              <div
                                key={day.id}
                                className={`p-3 rounded-lg ${
                                  day.learning_completed && day.application_completed
                                    ? "bg-muted/50"
                                    : day.day_number === currentDay?.day_number
                                    ? "bg-primary/5 border border-primary/30"
                                    : "bg-card border"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-medium">
                                    Day {day.day_number}
                                    {day.day_number === currentDay?.day_number && (
                                      <Badge className="ml-2 text-xs" variant="secondary">Today</Badge>
                                    )}
                                  </span>
                                  {day.is_rest_day && (
                                    <Badge variant="outline" className="text-xs"><Coffee className="w-3 h-3 mr-1" /> Rest</Badge>
                                  )}
                                  {day.completed_at && (
                                    <CheckCircle2 className="w-4 h-4 text-primary" />
                                  )}
                                </div>

                                {!day.is_rest_day && (
                                  <div className="space-y-1.5 text-sm">
                                    <div className="flex items-start gap-2">
                                      <button
                                        onClick={() => markComplete(day.id, "learning_completed", !day.learning_completed)}
                                        disabled={updating === day.id}
                                      >
                                        {day.learning_completed ? (
                                          <CheckCircle2 className="w-4 h-4 text-primary mt-0.5" />
                                        ) : (
                                          <Circle className="w-4 h-4 text-muted-foreground mt-0.5" />
                                        )}
                                      </button>
                                      <span className={day.learning_completed ? "text-muted-foreground line-through" : ""}>
                                        {day.learning_task}
                                      </span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                      <button
                                        onClick={() => markComplete(day.id, "application_completed", !day.application_completed)}
                                        disabled={updating === day.id}
                                      >
                                        {day.application_completed ? (
                                          <CheckCircle2 className="w-4 h-4 text-primary mt-0.5" />
                                        ) : (
                                          <Circle className="w-4 h-4 text-muted-foreground mt-0.5" />
                                        )}
                                      </button>
                                      <span className={day.application_completed ? "text-muted-foreground line-through" : ""}>
                                        {day.application_task}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })
                )}
              </div>
            )}

            {/* Sources Used (Collapsible) */}
            {path.sources_used && Array.isArray(path.sources_used) && path.sources_used.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between text-muted-foreground hover:text-foreground">
                    <span className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      {(path.sources_used as any[]).length} Sources Used
                    </span>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Card className="mt-2">
                    <CardContent className="py-4">
                      <div className="space-y-1.5">
                        {(path.sources_used as { id: string; title: string; type: string }[]).map((source, i) => (
                          <button
                            key={source.id}
                            onClick={() => handleOpenSource(source)}
                            disabled={openingSource === source.id}
                            className="flex items-center gap-2 text-sm w-full text-left hover:bg-muted/50 p-2 -mx-2 rounded-lg transition-colors group disabled:opacity-50"
                          >
                            <span className="text-muted-foreground font-mono">[{i + 1}]</span>
                            <span className="flex-1 group-hover:text-primary transition-colors">{source.title}</span>
                            <Badge variant="outline" className="text-xs shrink-0">{source.type}</Badge>
                            {openingSource === source.id ? (
                              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                            ) : (
                              <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
};

export default LearningPathDetail;
