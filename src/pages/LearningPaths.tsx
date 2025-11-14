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
import { useNavigate } from "react-router-dom";
import { z } from "zod";

const learningPathSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
  description: z.string().trim().max(2000, "Description must be less than 2,000 characters"),
});

const LearningPaths = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [paths, setPaths] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchPaths();
  }, [user]);

  const fetchPaths = async () => {
    const { data, error } = await supabase
      .from("learning_paths")
      .select("*, path_items(count)")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load topics");
      return;
    }

    setPaths(data || []);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate input
    const validation = learningPathSchema.safeParse({ title, description });
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast.error(firstError.message);
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.from("learning_paths").insert({
        user_id: user!.id,
        title: validation.data.title,
        description: validation.data.description,
        status: "active",
      });

      if (error) throw error;

      toast.success("Topic created");
      setTitle("");
      setDescription("");
      setIsDialogOpen(false);
      fetchPaths();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("learning_paths").delete().eq("id", id);

      if (error) throw error;

      toast.success("Topic deleted");
      fetchPaths();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleGenerateStep = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("synthesizer");

      if (error) throw error;

      toast.success(`Suggestion: ${data.suggestion}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium">Topics</h1>
          <p className="text-muted-foreground mt-2">
            Topics you're exploring
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleGenerateStep} disabled={generating} variant="outline" size="sm">
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
        {paths.map((path) => (
          <Card key={path.id} className="cursor-pointer" onClick={() => navigate(`/paths/${path.id}`)}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-medium">{path.title}</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(path.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {path.description && (
                <p className="text-sm text-muted-foreground">{path.description}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Topic</DialogTitle>
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
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creating..." : "Create Topic"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LearningPaths;
