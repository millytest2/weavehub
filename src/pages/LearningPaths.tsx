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
import { toast } from "sonner";
import { Plus, Map, Trash2 } from "lucide-react";

const LearningPaths = () => {
  const { user } = useAuth();
  const [paths, setPaths] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

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
      toast.error("Failed to load learning paths");
      return;
    }

    setPaths(data || []);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from("learning_paths").insert({
        user_id: user!.id,
        title,
        description,
        status: "active",
      });

      if (error) throw error;

      toast.success("Learning path created!");
      setTitle("");
      setDescription("");
      setOpen(false);
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

      toast.success("Learning path deleted");
      fetchPaths();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Learning Paths</h1>
          <p className="mt-1 text-muted-foreground">
            Structure your learning journey and track progress
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Path
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Learning Path</DialogTitle>
              <DialogDescription>
                Define a structured plan for your learning journey
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="e.g., Master React Development"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="What will you learn and achieve?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating..." : "Create Path"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {paths.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Map className="mb-4 h-16 w-16 text-muted-foreground opacity-20" />
            <h3 className="text-lg font-medium">No learning paths yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first structured learning plan
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {paths.map((path) => (
            <Card key={path.id} className="transition-all hover:shadow-md">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <Map className="h-5 w-5 text-success" />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(path.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <CardTitle className="mt-2 text-lg">{path.title}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={path.status === "active" ? "default" : "secondary"}>
                    {path.status}
                  </Badge>
                  <CardDescription className="text-xs">
                    {path.path_items?.[0]?.count || 0} items
                  </CardDescription>
                </div>
              </CardHeader>
              {path.description && (
                <CardContent>
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {path.description}
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

export default LearningPaths;
