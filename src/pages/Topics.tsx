import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, BookOpen, Trash2 } from "lucide-react";

const Topics = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [topics, setTopics] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchTopics();
  }, [user]);

  const fetchTopics = async () => {
    const { data, error } = await supabase
      .from("topics")
      .select(`
        *,
        insights:insights(count),
        documents:documents(count),
        learning_paths:learning_paths(count)
      `)
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load paths");
      return;
    }

    setTopics(data || []);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from("topics").insert({
        user_id: user!.id,
        name,
        description,
        color,
      });

      if (error) throw error;

      toast.success("Path created!");
      setName("");
      setDescription("");
      setColor("#3B82F6");
      setOpen(false);
      fetchTopics();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("topics").delete().eq("id", id);

      if (error) throw error;

      toast.success("Path deleted");
      fetchTopics();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getItemCount = (topic: any) => {
    const insights = topic.insights?.[0]?.count || 0;
    const docs = topic.documents?.[0]?.count || 0;
    const paths = topic.learning_paths?.[0]?.count || 0;
    return insights + docs + paths;
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium">Paths</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Areas you're learning and evolving in
          </p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          New Path
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {topics.map((topic) => (
          <Card key={topic.id} className="rounded-[10px] border-border/30">
            <CardContent className="pt-5">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${topic.color}20` }}
                >
                  <BookOpen className="h-4 w-4" style={{ color: topic.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-base mb-2">{topic.name}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                    {topic.description || "No description"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(topic.id)}
                  className="h-8 w-8 p-0 shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Learning Path</DialogTitle>
            <DialogDescription>
              Define an area you want to learn and track
            </DialogDescription>
          </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., AI & Machine Learning"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="What do you want to learn about this path?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="color">Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="color"
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-10 w-20"
                  />
                  <Input
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="#3B82F6"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating..." : "Create Path"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
    </div>
  );
};

export default Topics;