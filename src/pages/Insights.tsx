import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Lightbulb, Loader2 } from "lucide-react";
import { z } from "zod";

const insightSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
  content: z.string().trim().min(1, "Content is required").max(50000, "Content must be less than 50,000 characters"),
});

const PAGE_SIZE = 25;

const Insights = () => {
  const { user } = useAuth();
  const [insights, setInsights] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedInsight, setSelectedInsight] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          fetchInsights(false);
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, insights.length]);

  useEffect(() => {
    if (!user) return;
    fetchInsights(true);
  }, [user]);

  const fetchInsights = useCallback(async (reset = false) => {
    if (!user) return;
    
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    const offset = reset ? 0 : insights.length;

    try {
      // Get total count first (only on reset)
      if (reset) {
        const { count } = await supabase
          .from("insights")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id);
        setTotalCount(count || 0);
      }

      const { data, error } = await supabase
        .from("insights")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        toast.error("Failed to load insights");
        return;
      }

      const newInsights = data || [];
      
      if (reset) {
        setInsights(newInsights);
      } else {
        setInsights(prev => [...prev, ...newInsights]);
      }

      setHasMore(newInsights.length === PAGE_SIZE);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, insights.length]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate input
    const validation = insightSchema.safeParse({ title, content });
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast.error(firstError.message);
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.from("insights").insert({
        user_id: user!.id,
        title: validation.data.title,
        content: validation.data.content,
      });

      if (error) throw error;

      toast.success("Insight captured");
      setTitle("");
      setContent("");
      setIsDialogOpen(false);
      fetchInsights(true);
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
      setInsights(prev => prev.filter(i => i.id !== id));
      setTotalCount(prev => prev - 1);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Insights</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Capture thoughts, notes, ChatGPT snippets
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Insight
        </Button>
      </div>

      {loading && insights.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {insights.map((insight) => (
              <Card 
                key={insight.id} 
                className="rounded-[10px] border-border/30 hover:shadow-lg hover:border-primary/50 transition-all duration-200 cursor-pointer"
                onClick={() => setSelectedInsight(insight)}
              >
                <CardContent className="pt-5 pb-5">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Lightbulb className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-base mb-2">{insight.title}</h3>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(insight.id);
                        }}
                        className="h-8 w-8 p-0 shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-6 pl-11">{insight.content}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-4" />
          {loadingMore && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!hasMore && insights.length > 0 && (
            <p className="text-center text-xs text-muted-foreground py-2">
              {totalCount} insights
            </p>
          )}
        </>
      )}

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
                required
                rows={4}
                className="mt-1.5"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">
              {loading ? "Creating..." : "Create Insight"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!selectedInsight} onOpenChange={() => setSelectedInsight(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedInsight?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {selectedInsight?.content}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="destructive"
                onClick={() => {
                  handleDelete(selectedInsight.id);
                  setSelectedInsight(null);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Insights;