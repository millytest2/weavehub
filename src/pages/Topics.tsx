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
        learning_paths:learning_paths(count),
        experiments:experiments(count)
      `)
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load topics");
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

      toast.success("Topic created!");
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

      toast.success("Topic deleted");
      fetchTopics();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getItemCount = (topic: any) => {
    const insights = topic.insights?.[0]?.count || 0;
    const docs = topic.documents?.[0]?.count || 0;
    const paths = topic.learning_paths?.[0]?.count || 0;
    const exps = topic.experiments?.[0]?.count || 0;
    return insights + docs + paths + exps;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Topics</h1>
          <p className="mt-1 text-muted-foreground">
            Organize your learning around specific subjects
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Topic
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Learning Topic</DialogTitle>
              <DialogDescription>
                Define a subject area you want to learn and track
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
                  placeholder="What do you want to learn about this topic?"
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
                {loading ? "Creating..." : "Create Topic"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {topics.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BookOpen className="mb-4 h-16 w-16 text-muted-foreground opacity-20" />
            <h3 className="text-lg font-medium">No topics yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first learning topic to get started
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {topics.map((topic) => (
            <Card
              key={topic.id}
              className="cursor-pointer transition-all hover:shadow-md"
              onClick={() => navigate(`/topics/${topic.id}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div
                    className="h-8 w-8 rounded-full"
                    style={{ backgroundColor: topic.color }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(topic.id);
                    }}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <CardTitle className="mt-2 text-lg">{topic.name}</CardTitle>
                <CardDescription className="line-clamp-2">
                  {topic.description || "No description"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{getItemCount(topic)} items</Badge>
                  <span className="text-xs text-muted-foreground">
                    {topic.insights?.[0]?.count || 0} insights · {topic.documents?.[0]?.count || 0} docs
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Topics;