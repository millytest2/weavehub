import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Sparkles } from "lucide-react";

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
    const { data, error } = await supabase
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
      const { error } = await supabase.from("experiments").insert({
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
      const { error } = await supabase.from("experiments").delete().eq("id", id);

      if (error) throw error;

      toast.success("Experiment deleted");
      fetchExperiments();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium">Experiments</h1>
          <p className="text-muted-foreground mt-2">
            Test, learn, evolve
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleGenerateExperiment} disabled={generating} variant="outline" size="sm">
            <Sparkles className="mr-2 h-4 w-4" />
            {generating ? "Generating..." : "Generate"}
          </Button>
          <Button onClick={() => setIsDialogOpen(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {experiments.map((experiment) => (
          <Card key={experiment.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-medium">{experiment.title}</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(experiment.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mb-2">{experiment.description}</p>
              {experiment.identity_shift_target && (
                <p className="text-xs text-muted-foreground italic">
                  → {experiment.identity_shift_target}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
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
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="identityShift">Identity Shift Target</Label>
              <Input
                id="identityShift"
                value={identityShift}
                onChange={(e) => setIdentityShift(e.target.value)}
                placeholder="Who do you want to become?"
              />
            </div>
            <div>
              <Label htmlFor="steps">Steps</Label>
              <Textarea
                id="steps"
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                rows={4}
              />
            </div>
            <div>
              <Label htmlFor="duration">Duration</Label>
              <Input
                id="duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="e.g., 7 days"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creating..." : "Create Experiment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Experiments;
