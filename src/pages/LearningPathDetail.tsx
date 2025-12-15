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
}

const LearningPathDetail = () => {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [path, setPath] = useState<LearningPath | null>(null);
  const [dailyProgress, setDailyProgress] = useState<DailyProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [openWeeks, setOpenWeeks] = useState<number[]>([1]);
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completedInsightId, setCompletedInsightId] = useState<string | null>(null);
  const [legacyPathError, setLegacyPathError] = useState<string | null>(null);
  const [recreating, setRecreating] = useState(false);

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

    setPath(pathResult.data);
    setDailyProgress(progressResult.data || []);

    // Open current week
    if (pathResult.data?.current_day) {
      const currentWeek = Math.ceil(pathResult.data.current_day / 7);
      setOpenWeeks([currentWeek]);
    }

    setLoading(false);
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

    // If both learning and application are now complete, mark day complete
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
      // Update local state
      setDailyProgress((prev) => prev.map((d) => (d.id === progressId ? ({ ...d, ...updates } as DailyProgress) : d)));

      // Check if we should advance current_day
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

      // Non-2xx responses usually surface as `error` with `context.body` containing JSON.
      if (error) {
        const parsed = parseFunctionInvokeError(error);
        if (parsed.code === "legacy_path") {
          setLegacyPathError(parsed.message);
        }
        toast.error(parsed.message);
        return;
      }

      // Some environments may still return an error payload in `data`.
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
        body: { topic: topicName, durationDays: path.duration_days || 30 },
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

      // Delete the old legacy path
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

  // Group by weeks
  const weeks: DailyProgress[][] = [];
  for (let i = 0; i < dailyProgress.length; i += 7) {
    weeks.push(dailyProgress.slice(i, i + 7));
  }

  const currentDay = dailyProgress.find((d) => !d.learning_completed || !d.application_completed);

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/learning-paths")} className="mb-2">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Paths
        </Button>

        <Card>
          <CardHeader className="space-y-4">
            <div className="space-y-1">
              <CardTitle className="text-xl">{path.topic_name || path.title}</CardTitle>
              <CardDescription>{path.description}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={toggleStatus}>
                {path.status === "active" ? (
                  <>
                    <Pause className="w-4 h-4 mr-1" /> Pause
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-1" /> Resume
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={regenerating || !!legacyPathError}
              >
                {regenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-1" />
                )}
                <span className="sm:inline hidden">Regenerate</span>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4 mr-1" />
                    <span className="sm:inline hidden">Delete</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Learning Path</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete this learning path and all progress. This action cannot be undone.
                    </AlertDialogDescription>
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
          </CardHeader>
          <CardContent className="space-y-4">
            {legacyPathError && (
              <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                <p className="text-muted-foreground mb-3">{legacyPathError}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleRecreatePath} disabled={recreating}>
                    {recreating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RotateCcw className="w-4 h-4 mr-1" />}
                    Recreate with Latest Sources
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate("/learning-paths")}>
                    Browse Paths
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Day {completedDays} of {path.duration_days}
              </span>
              {path.final_deliverable && (
                <span className="flex items-center gap-1">
                  <Target className="w-4 h-4" />
                  {path.final_deliverable}
                </span>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span className="text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {path.sub_topics && Array.isArray(path.sub_topics) && path.sub_topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(path.sub_topics as string[]).map((t, i) => (
                  <Badge key={i} variant="outline" className="text-xs font-normal">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Path Complete - Celebration Card */}
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

        {/* Already Codified Badge */}
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
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => navigate(`/insights`)}
                >
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

        {/* Today's Tasks */}
        {currentDay && !currentDay.is_rest_day && (
          <Card className="border-primary/50 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Day {currentDay.day_number} - Today's Tasks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => markComplete(currentDay.id, "learning_completed", !currentDay.learning_completed)}
                    disabled={updating === currentDay.id}
                    className="mt-0.5"
                  >
                    {currentDay.learning_completed ? (
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>
                  <div>
                    <p className="text-sm font-medium">Learning</p>
                    <p className={`text-sm ${currentDay.learning_completed ? "text-muted-foreground line-through" : ""}`}>
                      {currentDay.learning_task}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <button
                    onClick={() => markComplete(currentDay.id, "application_completed", !currentDay.application_completed)}
                    disabled={updating === currentDay.id}
                    className="mt-0.5"
                  >
                    {currentDay.application_completed ? (
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>
                  <div>
                    <p className="text-sm font-medium">Application</p>
                    <p className={`text-sm ${currentDay.application_completed ? "text-muted-foreground line-through" : ""}`}>
                      {currentDay.application_task}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rest Day Card */}
        {currentDay && currentDay.is_rest_day && (
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardContent className="py-6 text-center">
              <Coffee className="w-8 h-8 mx-auto text-amber-600 mb-2" />
              <p className="font-medium">Day {currentDay.day_number} - Rest Day</p>
              <p className="text-sm text-muted-foreground mb-4">Let concepts integrate. No tasks today.</p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => markRestDayComplete(currentDay.id)}
                disabled={updating === currentDay.id}
              >
                {updating === currentDay.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Mark Rest Day Complete"
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Weekly Breakdown */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Full Schedule</h2>

          {dailyProgress.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  This path doesnt have a generated schedule yet.
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
                              : "bg-card border"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">Day {day.day_number}</span>
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

        {/* Sources Used */}
        {path.sources_used && Array.isArray(path.sources_used) && path.sources_used.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Sources Used</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {(path.sources_used as { id: string; title: string; type: string }[]).map((source, i) => (
                  <div key={source.id} className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">[{i + 1}]</span>
                    <span>{source.title}</span>
                    <Badge variant="outline" className="text-xs">{source.type}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
};

export default LearningPathDetail;
