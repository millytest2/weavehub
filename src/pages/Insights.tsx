import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Lightbulb, Trash2 } from "lucide-react";

const Insights = () => {
  const { user } = useAuth();
  const [insights, setInsights] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [topicId, setTopicId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchInsights();
    fetchTopics();
  }, [user]);

  const fetchInsights = async () => {
    const { data, error } = await supabase
      .from("insights")
      .select("*, topics(name, color)")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load insights");
      return;
    }

    setInsights(data || []);
  };

  const fetchTopics = async () => {
    const { data } = await supabase
      .from("topics")
      .select("id, name, color")
      .eq("user_id", user!.id);
    setTopics(data || []);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from("insights").insert({
        user_id: user!.id,
        title,
        content,
        topic_id: topicId || null,
      });

      if (error) throw error;

      toast.success("Insight captured!");
      setTitle("");
      setContent("");
      setTopicId("");
      setOpen(false);
      fetchInsights();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("insights").delete().eq("id", id);

      if (error) throw error;

      toast.success("Insight deleted");
      fetchInsights();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Insights</h1>
          <p className="mt-1 text-muted-foreground">
            Capture your thoughts, learnings, and ChatGPT conversations
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Insight
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Capture New Insight</DialogTitle>
              <DialogDescription>
                Save an important thought, learning, or conversation
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Brief description..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  placeholder="Paste your ChatGPT conversation, notes, or thoughts..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  rows={8}
                />
              </div>
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
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Saving..." : "Save Insight"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {insights.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Lightbulb className="mb-4 h-16 w-16 text-muted-foreground opacity-20" />
            <h3 className="text-lg font-medium">No insights yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Start capturing your thoughts and learnings
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {insights.map((insight) => (
            <Card key={insight.id} className="transition-all hover:shadow-md">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <Lightbulb className="h-5 w-5 text-accent" />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(insight.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <CardTitle className="mt-2 text-lg">{insight.title}</CardTitle>
                <CardDescription className="text-xs">
                  {new Date(insight.created_at).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-4 text-sm text-muted-foreground">
                  {insight.content}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Insights;
