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
import { Plus, Trash2 } from "lucide-react";

const Insights = () => {
  const { user } = useAuth();
  const [insights, setInsights] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchInsights();
  }, [user]);

  const fetchInsights = async () => {
    const { data, error } = await supabase
      .from("insights")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load insights");
      return;
    }

    setInsights(data || []);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from("insights").insert({
        user_id: user!.id,
        title,
        content,
      });

      if (error) throw error;

      toast.success("Insight captured");
      setTitle("");
      setContent("");
      setIsDialogOpen(false);
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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium">Insights</h1>
          <p className="text-muted-foreground mt-2">
            Your identity, values, and beliefs
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {insights.map((insight) => (
          <Card key={insight.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-medium">{insight.title}</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(insight.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{insight.content}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Insight</DialogTitle>
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
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
                required
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Saving..." : "Save Insight"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Insights;
