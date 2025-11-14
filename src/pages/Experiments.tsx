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
import { Plus, Trash2, Sparkles, FlaskConical } from "lucide-react";

const Experiments = () => {
  const { user } = useAuth();
  const [experiments, setExperiments] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
      .order("created_at", { ascending: false});

    if (error) {
      toast.error("Failed to load experiments");
      return;
    }

    setExperiments(data || []);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await (supabase as any).from("experiments").insert({
        user_id: user!.id,
        title,
        description,
        steps,
        duration,
        identity_shift_target: identityShift,
        status: "planned",
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
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("experiment-generator", {
        body: {}
      });

      if (error) throw error;

      const generatedExperiments = data.experiments;
      if (generatedExperiments && generatedExperiments.length > 0) {
        const exp = generatedExperiments[0];
        setTitle(exp.title);
        setDescription(exp.description);
        setSteps(exp.steps.join("\n"));
        setDuration(exp.duration);
        setIdentityShift(exp.identity_shift_target);
        setIsDialogOpen(true);
        toast.success("Experiment generated");
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-primary/10 text-primary border-primary/20";
      case "in_progress": return "bg-accent/10 text-accent border-accent/20";
      default: return "bg-secondary text-secondary-foreground border-border";
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Experiments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Test, learn, evolve
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleGenerateExperiment} 
            disabled={generating} 
            variant="outline" 
            size="sm"
            className="border-primary/20 text-primary hover:bg-primary/10"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {generating ? "Generating..." : "Generate"}
          </Button>
          <Button onClick={() => setIsDialogOpen(true)} size="sm" className="bg-primary hover:bg-primary/90">
            <Plus className="mr-2 h-4 w-4" />
            New
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {experiments.map((exp) => (
          <Card key={exp.id} className="rounded-[10px] shadow-sm border-border/50">
            <CardContent className="pt-5">
              <div className="flex items-start gap-3 mb-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FlaskConical className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base mb-2">{exp.title}</h3>
                  {exp.identity_shift_target && (
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-3">{exp.identity_shift_target}</p>
                  )}
                  <Badge variant="outline" className={getStatusColor(exp.status)}>
                    {exp.status}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(exp.id)}
                  className="h-8 w-8 p-0 shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New Experiment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="mt-1.5"
              />
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
              <Input
                id="duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">
              {loading ? "Creating..." : "Create Experiment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Experiments;
