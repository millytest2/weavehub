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
import { Plus, FlaskConical, Trash2 } from "lucide-react";

const Experiments = () => {
  const { user } = useAuth();
  const [experiments, setExperiments] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [paths, setPaths] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [topicId, setTopicId] = useState<string>("");
  const [pathId, setPathId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchExperiments();
    fetchTopics();
    fetchPaths();
  }, [user]);

  const fetchExperiments = async () => {
    const { data, error } = await (supabase as any)
      .from("experiments")
      .select("*, topics(name, color), learning_paths(title)")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load experiments");
      return;
    }

    setExperiments(data || []);
  };

  const fetchTopics = async () => {
    const { data } = await supabase
      .from("topics")
      .select("id, name, color")
      .eq("user_id", user!.id);
    setTopics(data || []);
  };

  const fetchPaths = async () => {
    const { data } = await supabase
      .from("learning_paths")
      .select("id, title")
      .eq("user_id", user!.id);
    setPaths(data || []);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await (supabase as any).from("experiments").insert({
        user_id: user!.id,
        title,
        description,
        hypothesis,
        topic_id: topicId || null,
        learning_path_id: pathId || null,
        status: "planning",
      });

      if (error) throw error;

      toast.success("Experiment created!");
      setTitle("");
      setDescription("");
      setHypothesis("");
      setTopicId("");
      setPathId("");
      setOpen(false);
      fetchExperiments();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
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

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const { error } = await (supabase as any)
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
    planning: "secondary",
    running: "default",
    completed: "default",
    failed: "destructive",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Experiments</h1>
          <p className="mt-1 text-muted-foreground">
            Test your learning through hands-on experiments
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Experiment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Experiment</DialogTitle>
              <DialogDescription>
                Define a hands-on project or test to apply your learning
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="e.g., Build a sentiment analysis model"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="What will you build or test?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hypothesis">Hypothesis</Label>
                <Textarea
                  id="hypothesis"
                  placeholder="What do you expect to learn or achieve?"
                  value={hypothesis}
                  onChange={(e) => setHypothesis(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="topic">Topic (optional)</Label>
                  <Select value={topicId} onValueChange={setTopicId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a topic" />
                    </SelectTrigger>
                    <SelectContent>
                      {topics.map((topic) => (
                        <SelectItem key={topic.id} value={topic.id}>
                          {topic.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="path">Learning Path (optional)</Label>
                  <Select value={pathId} onValueChange={setPathId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a path" />
                    </SelectTrigger>
                    <SelectContent>
                      {paths.map((path) => (
                        <SelectItem key={path.id} value={path.id}>
                          {path.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating..." : "Create Experiment"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {experiments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FlaskConical className="mb-4 h-16 w-16 text-muted-foreground opacity-20" />
            <h3 className="text-lg font-medium">No experiments yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first experiment to apply your learning
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
                <div className="flex items-center gap-2 flex-wrap">
                  <Select
                    value={exp.status}
                    onValueChange={(status) => handleUpdateStatus(exp.id, status)}
                  >
                    <SelectTrigger className="h-7 w-auto text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planning">Planning</SelectItem>
                      <SelectItem value="running">Running</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                  {exp.topics && (
                    <Badge
                      variant="secondary"
                      style={{ backgroundColor: exp.topics.color + "20", color: exp.topics.color }}
                    >
                      {exp.topics.name}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              {exp.description && (
                <CardContent>
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {exp.description}
                  </p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Experiments;