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
import { Plus, Trash2, Lightbulb, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { z } from "zod";

const insightSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
  content: z.string().trim().min(1, "Content is required").max(50000, "Content must be less than 50,000 characters"),
});

const INITIAL_SIZE = 20;
const MAX_SCROLL_SIZE = 50;
const PAGE_SIZE = 50;

const Insights = () => {
  const { user } = useAuth();
  const [insights, setInsights] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedInsight, setSelectedInsight] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const showPagination = totalCount > MAX_SCROLL_SIZE;

  // Infinite scroll observer - only active within first page and under 50 items
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || currentPage > 0 || !canLoadMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && canLoadMore && !loadingMore && !loading && insights.length < MAX_SCROLL_SIZE) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMore, loadingMore, loading, insights.length, currentPage]);

  useEffect(() => {
    if (!user) return;
    fetchInsights(0);
  }, [user]);

  const fetchInsights = useCallback(async (page: number) => {
    if (!user) return;
    
    setLoading(true);
    setCurrentPage(page);

    const offset = page * PAGE_SIZE;
    const limit = page === 0 ? INITIAL_SIZE : PAGE_SIZE;

    try {
      // Get total count
      const { count } = await supabase
        .from("insights")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);
      setTotalCount(count || 0);

      const { data, error } = await supabase
        .from("insights")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        toast.error("Failed to load insights");
        return;
      }

      setInsights(data || []);
      setCanLoadMore(page === 0 && (data?.length || 0) >= INITIAL_SIZE && (count || 0) > INITIAL_SIZE);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadMore = useCallback(async () => {
    if (!user || loadingMore || insights.length >= MAX_SCROLL_SIZE) return;
    
    setLoadingMore(true);
    const offset = insights.length;
    const remaining = MAX_SCROLL_SIZE - insights.length;
    const limit = Math.min(remaining, 15);

    try {
      const { data, error } = await supabase
        .from("insights")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) return;

      const newInsights = data || [];
      setInsights(prev => [...prev, ...newInsights]);
      setCanLoadMore(newInsights.length >= limit && insights.length + newInsights.length < MAX_SCROLL_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [user, insights.length, loadingMore]);

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
      fetchInsights(0);
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

          {/* Infinite scroll sentinel - only for first page */}
          {currentPage === 0 && canLoadMore && insights.length < MAX_SCROLL_SIZE && (
            <>
              <div ref={sentinelRef} className="h-4" />
              {loadingMore && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </>
          )}

          {/* Pagination controls - show after 50 items */}
          {showPagination && (
            <div className="flex flex-col items-center gap-2 py-6">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchInsights(currentPage - 1)}
                  disabled={currentPage === 0 || loading}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchInsights(currentPage + 1)}
                  disabled={currentPage >= totalPages - 1 || loading}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {totalCount} insights total
              </p>
            </div>
          )}

          {/* Show total at bottom when not paginating and done loading */}
          {!showPagination && !canLoadMore && insights.length > 0 && (
            <p className="text-center text-xs text-muted-foreground py-4">
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