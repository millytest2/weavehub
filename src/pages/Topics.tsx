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
import { Plus, BookOpen, Trash2, Edit } from "lucide-react";
import { z } from "zod";

const topicSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  description: z.string().trim().max(1000, "Description must be less than 1,000 characters"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format"),
});

const Topics = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [topics, setTopics] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<any>(null);
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
    
    // Validate input
    const validation = topicSchema.safeParse({ name, description, color });
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast.error(firstError.message);
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.from("topics").insert({
        user_id: user!.id,
        name: validation.data.name,
        description: validation.data.description,
        color: validation.data.color,
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

  const handleEdit = (topic: any) => {
    setEditingTopic(topic);
    setName(topic.name);
    setDescription(topic.description || "");
    setColor(topic.color);
    setEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate input
    const validation = topicSchema.safeParse({ name, description, color });
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast.error(firstError.message);
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.from("topics")
        .update({
          name: validation.data.name,
          description: validation.data.description,
          color: validation.data.color,
        })
        .eq("id", editingTopic.id);

      if (error) throw error;

      toast.success("Path updated!");
      setName("");
      setDescription("");
      setColor("#3B82F6");
      setEditOpen(false);
      setEditingTopic(null);
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
          <h1 className="text-3xl font-bold text-foreground">Paths</h1>
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
          <Card key={topic.id} className="rounded-[10px] border-border/30 hover:shadow-lg hover:border-primary/50 transition-all duration-200">
            <CardContent className="pt-5">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${topic.color}20` }}
                >
                  <BookOpen className="h-4 w-4" style={{ color: topic.color }} />
                </div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/paths/${topic.id}`)}>
                  <h3 className="font-medium text-base mb-2">{topic.name}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                    {topic.description || "No description"}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(topic);
                    }}
                    className="h-8 w-8 p-0"
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(topic.id);
                    }}
                    className="h-8 w-8 p-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
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

    <Dialog open={editOpen} onOpenChange={(open) => {
      setEditOpen(open);
      if (!open) {
        setName("");
        setDescription("");
        setColor("#3B82F6");
        setEditingTopic(null);
      }
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Learning Path</DialogTitle>
          <DialogDescription>
            Update your learning path details
          </DialogDescription>
        </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                placeholder="e.g., AI & Machine Learning"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                placeholder="What do you want to learn about this path?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-color">Color</Label>
              <div className="flex gap-2">
                <Input
                  id="edit-color"
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
          {loading ? "Updating..." : "Update Path"}
        </Button>
      </form>
    </DialogContent>
  </Dialog>
    </div>
  );
};

export default Topics;