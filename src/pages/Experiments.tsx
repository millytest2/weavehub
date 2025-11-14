import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, FlaskConical, Trash2, Sparkles } from "lucide-react";

const Experiments = () => {
  const { user } = useAuth();
  const [experiments, setExperiments] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
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

      toast.success("Experiment created!");
      setTitle("");
      setDescription("");
      setSteps("");
      setDuration("");
      setIdentityShift("");
      setOpen(false);
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
        setOpen(true);
        toast.success("Experiment generated! Review and save.");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate experiment");
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

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase
        .from("experiments")
        .update({ status })
        .eq("id", id);

      if (error) throw error;

      toast.success("Status updated");
      fetchExperiments();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const statusColors: Record<string, string> = {
    planned: "bg-blue-500/10 text-blue-500",
    active: "bg-green-500/10 text-green-500",
    completed: "bg-purple-500/10 text-purple-500",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Experiments</h1>
          <p className="mt-1 text-muted-foreground">
            Test ideas and track identity shifts
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleGenerateExperiment}
            disabled={generating}
            variant="outline"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {generating ? "Generating..." : "Generate Experiment"}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Experiment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Experiment</DialogTitle>
                <DialogDescription>
                  Design a simple experiment to test and learn
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="What are you testing?"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief overview"
                    rows={2}
                  />
                </div>
                <div>
                  <Label htmlFor="steps">Steps (one per line)</Label>
                  <Textarea
                    id="steps"
                    value={steps}
                    onChange={(e) => setSteps(e.target.value)}
                    placeholder="1. First step&#10;2. Second step"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="duration">Duration</Label>
                    <Input
                      id="duration"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      placeholder="e.g., 7 days, 2 weeks"
                    />
                  </div>
                  <div>
                    <Label htmlFor="identity">Identity Shift Target</Label>
                    <Input
                      id="identity"
                      value={identityShift}
                      onChange={(e) => setIdentityShift(e.target.value)}
                      placeholder="Who you're becoming"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Creating..." : "Create"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {experiments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FlaskConical className="mb-4 h-16 w-16 text-muted-foreground opacity-20" />
            <h3 className="text-lg font-medium">No experiments yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first experiment or generate one with AI
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {experiments.map((exp) => (
            <Card key={exp.id} className="transition-all hover:shadow-md">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <FlaskConical className="h-5 w-5 text-primary" />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(exp.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <CardTitle className="mt-2 text-lg">{exp.title}</CardTitle>
                <div className="flex items-center gap-2">
                  <Select
                    value={exp.status}
                    onValueChange={(value) => handleUpdateStatus(exp.id, value)}
                  >
                    <SelectTrigger className="h-7 w-auto border-0 bg-transparent p-0 hover:bg-transparent">
                      <SelectValue>
                        <Badge className={statusColors[exp.status]}>
                          {exp.status}
                        </Badge>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planned">Planned</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {exp.description && (
                    <p className="text-muted-foreground">{exp.description}</p>
                  )}
                  {exp.duration && (
                    <p className="text-xs">
                      <span className="font-medium">Duration:</span> {exp.duration}
                    </p>
                  )}
                  {exp.identity_shift_target && (
                    <p className="text-xs">
                      <span className="font-medium">Identity:</span> {exp.identity_shift_target}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Experiments;