import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Sparkles, FlaskConical, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

const experimentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
  description: z.string().trim().max(2000, "Description must be less than 2,000 characters"),
  steps: z.string().trim().max(5000, "Steps must be less than 5,000 characters"),
  duration: z.string().trim().max(100, "Duration must be less than 100 characters"),
  identityShift: z.string().trim().max(500, "Identity shift must be less than 500 characters"),
});

const Experiments = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [experiments, setExperiments] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedExperiment, setSelectedExperiment] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [duration, setDuration] = useState("");
  const [identityShift, setIdentityShift] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchExperiments();
  }, [user]);

  const fetchExperiments = async () => {
    const { data, error } = await (supabase as any)
      .from("experiments")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load experiments");
      return;
    }

    setExperiments(data || []);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate input
    const validation = experimentSchema.safeParse({ title, description, steps, duration, identityShift });
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast.error(firstError.message);
      return;
    }

    setLoading(true);

    try {
      const { error } = await (supabase as any).from("experiments").insert({
        user_id: user!.id,
        title: validation.data.title,
        description: validation.data.description,
        steps: validation.data.steps,
        duration: validation.data.duration,
        identity_shift_target: validation.data.identityShift,
        status: "planning",
      });

      if (error) throw error;

      toast.success("Experiment created");
      setTitle("");
      setDescription("");
      setSteps("");
      setDuration("");
      setIdentityShift("");
      setIsDialogOpen(false);
      fetchExperiments();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateExperiment = async () => {
    // Check for active experiments first
    const activeExperiments = experiments.filter((e) => e.status === "in_progress" || e.status === "planning");

    if (activeExperiments.length > 0) {
      toast.error("You already have an active experiment. Complete or pause it first.", {
        description: "One experiment at a time ensures focus and completion.",
      });
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("experiment-generator", {
        body: {},
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      const generatedExperiments = data.experiments;
      if (generatedExperiments && generatedExperiments.length > 0) {
        // Edge function already inserted - just update status to in_progress
        // Find the newly created experiment (it was inserted with 'planning' status)
        const { data: newExp } = await supabase
          .from("experiments")
          .select("id")
          .eq("user_id", user!.id)
          .eq("title", generatedExperiments[0].title)
          .eq("status", "planning")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (newExp) {
          await supabase.from("experiments").update({ status: "in_progress" }).eq("id", newExp.id);
        }

        toast.success("Experiment generated and activated");
        fetchExperiments();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await (supabase as any).from("experiments").delete().eq("id", id);

      if (error) throw error;

      toast.success("Experiment deleted");
      fetchExperiments();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleViewDetails = (exp: any) => {
    setSelectedExperiment(exp);
    setIsDetailOpen(true);
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase.from("experiments").update({ status: newStatus }).eq("id", id);

      if (error) throw error;

      toast.success(
        `Experiment ${newStatus === "completed" ? "completed" : newStatus === "in_progress" ? "activated" : "paused"}`,
      );
      fetchExperiments();
    } catch (error: any) {
      toast.error(error.message || "Failed to update status");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-primary/10 text-primary border-primary/20";
      case "in_progress":
        return "bg-accent/10 text-accent border-accent/20";
      case "paused":
        return "bg-muted/10 text-muted-foreground border-border";
      default:
        return "bg-secondary text-secondary-foreground border-border";
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto px-4 sm:px-0">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate("/")} 
          className="shrink-0 h-9 w-9 rounded-full hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-foreground">Experiments</h1>
          <p className="text-sm text-muted-foreground">Go do cool shit</p>
        </div>
        <div className="flex gap-1">
          <Button onClick={handleGenerateExperiment} disabled={generating} variant="ghost" size="icon" className="h-9 w-9">
            <Sparkles className="h-4 w-4" />
          </Button>
          <Button onClick={() => setIsDialogOpen(true)} variant="ghost" size="icon" className="h-9 w-9">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Active Experiment - Prominent */}
      {experiments.filter((e) => e.status === "in_progress").length > 0 && (
        <div className="space-y-3">
          {experiments
            .filter((e) => e.status === "in_progress")
            .map((exp) => (
              <Card
                key={exp.id}
                className="border-primary/30 bg-primary/5 cursor-pointer hover:border-primary/50 transition-all"
                onClick={() => handleViewDetails(exp)}
              >
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                        Active
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(exp.id);
                        }}
                        className="h-7 w-7 p-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <h3 className="font-semibold text-base">{exp.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">{exp.description}</p>
                    {exp.duration && (
                      <p className="text-xs text-muted-foreground">{exp.duration}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      {/* Other Experiments - Compact List */}
      {experiments.filter((e) => e.status !== "in_progress").length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide px-1 mb-2">Past</p>
          {experiments
            .filter((e) => e.status !== "in_progress")
            .map((exp) => (
              <div
                key={exp.id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                onClick={() => handleViewDetails(exp)}
              >
                <FlaskConical className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{exp.title}</p>
                </div>
                <Badge variant="outline" className={`${getStatusColor(exp.status)} text-xs shrink-0`}>
                  {exp.status}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(exp.id);
                  }}
                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
        </div>
      )}

      {experiments.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground mb-4">No experiments yet</p>
          <Button onClick={handleGenerateExperiment} disabled={generating} variant="outline" size="sm">
            <Sparkles className="mr-2 h-4 w-4" />
            Generate your first experiment
          </Button>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New Experiment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="identityShift">Identity Shift Target</Label>
              <Input
                id="identityShift"
                value={identityShift}
                onChange={(e) => setIdentityShift(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="steps">Steps</Label>
              <Textarea
                id="steps"
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                rows={3}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="duration">Duration</Label>
              <Input id="duration" value={duration} onChange={(e) => setDuration(e.target.value)} className="mt-1.5" />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">
              {loading ? "Creating..." : "Create Experiment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail View Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <DialogTitle className="text-2xl">{selectedExperiment?.title}</DialogTitle>
              <Badge variant="outline" className={getStatusColor(selectedExperiment?.status || "planning")}>
                {selectedExperiment?.status}
              </Badge>
            </div>
          </DialogHeader>
          <div className="space-y-6">
            {selectedExperiment?.description && (
              <div>
                <h3 className="text-sm font-medium mb-2">Description</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{selectedExperiment.description}</p>
              </div>
            )}

            {selectedExperiment?.identity_shift_target && (
              <div>
                <h3 className="text-sm font-medium mb-2">Identity Shift Target</h3>
                <p className="text-sm text-muted-foreground">{selectedExperiment.identity_shift_target}</p>
              </div>
            )}

            {selectedExperiment?.steps && (
              <div>
                <h3 className="text-sm font-medium mb-2">Steps</h3>
                <div className="space-y-2">
                  {selectedExperiment.steps
                    .split("\n")
                    .filter((step: string) => step.trim())
                    .map((step: string, idx: number) => (
                      <div key={idx} className="flex gap-2">
                        <span className="text-sm text-muted-foreground">{idx + 1}.</span>
                        <span className="text-sm text-muted-foreground">{step}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {selectedExperiment?.duration && (
              <div>
                <h3 className="text-sm font-medium mb-2">Duration</h3>
                <p className="text-sm text-muted-foreground">{selectedExperiment.duration}</p>
              </div>
            )}

            {selectedExperiment?.results && (
              <div>
                <h3 className="text-sm font-medium mb-2">Results</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{selectedExperiment.results}</p>
              </div>
            )}

            {/* Status Controls */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium mb-3">Actions</h3>
              <div className="flex gap-2">
                {selectedExperiment?.status !== "in_progress" && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleStatusChange(selectedExperiment.id, "in_progress")}
                  >
                    Activate
                  </Button>
                )}
                {(selectedExperiment?.status === "in_progress" || selectedExperiment?.status === "planning") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStatusChange(selectedExperiment.id, "paused")}
                  >
                    Pause
                  </Button>
                )}
                {selectedExperiment?.status !== "completed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStatusChange(selectedExperiment.id, "completed")}
                  >
                    Mark Complete
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Experiments;
