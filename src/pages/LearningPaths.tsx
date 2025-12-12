import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Sparkles, ChevronDown, ChevronRight, ExternalLink, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { detectCareerKeywords } from "@/lib/careerDetection";
import { CareerRedirectPrompt } from "@/components/CareerRedirectPrompt";

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
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [pathItems, setPathItems] = useState<Record<string, any[]>>({});
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [focusArea, setFocusArea] = useState("");
  const [showCareerPrompt, setShowCareerPrompt] = useState(false);
  const [pendingFocusArea, setPendingFocusArea] = useState("");

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
      toast.error("Failed to load paths");
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

      toast.success("Path created");
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

      toast.success("Path deleted");
      fetchPaths();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const executePathGeneration = async (focus: string) => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("path-generator", {
        body: { focus }
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      toast.success(`Path created with ${data.steps_created} steps`);
      setGenerateDialogOpen(false);
      setFocusArea("");
      fetchPaths();
    } catch (error: any) {
      toast.error(error.message || "Failed to generate path");
    } finally {
      setGenerating(false);
    }
  };

  const handleGeneratePath = async () => {
    // Check for career-related keywords
    if (detectCareerKeywords(focusArea)) {
      setPendingFocusArea(focusArea);
      setShowCareerPrompt(true);
      return;
    }
    
    await executePathGeneration(focusArea);
  };

  const handleCareerPromptContinue = async () => {
    setShowCareerPrompt(false);
    await executePathGeneration(pendingFocusArea);
    setPendingFocusArea("");
  };

  const fetchPathItems = async (pathId: string) => {
    const { data, error } = await supabase
      .from("path_items")
      .select("*")
      .eq("path_id", pathId)
      .order("order_index", { ascending: true });

    if (error) {
      toast.error("Failed to load path items");
      return;
    }

    setPathItems(prev => ({ ...prev, [pathId]: data || [] }));
  };

  const togglePath = async (pathId: string) => {
    const isExpanding = !expandedPaths[pathId];
    setExpandedPaths(prev => ({ ...prev, [pathId]: isExpanding }));
    
    if (isExpanding && !pathItems[pathId]) {
      await fetchPathItems(pathId);
    }
  };

  return (
    <div className="space-y-6 px-4 sm:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Paths</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Areas you're learning and evolving in
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setGenerateDialogOpen(true)} disabled={generating} variant="outline" size="sm">
            <Sparkles className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">{generating ? "Generating..." : "Generate"}</span>
          </Button>
          <Button onClick={() => setIsDialogOpen(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">New Path</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {paths.map((path) => (
          <Collapsible
            key={path.id}
            open={expandedPaths[path.id]}
            onOpenChange={() => togglePath(path.id)}
          >
            <Card className="rounded-[10px] border-border/30 hover:shadow-lg hover:border-primary/50 transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <CollapsibleTrigger className="flex items-start gap-3 flex-1 text-left min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {expandedPaths[path.id] ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm sm:text-base leading-tight mb-1">
                        {path.title}
                      </h3>
                      {path.description && (
                        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-2">
                          {path.description}
                        </p>
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/paths/${path.id}`);
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(path.id);
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <CollapsibleContent className="mt-4 pt-3 border-t border-border/30">
                  {pathItems[path.id]?.length > 0 ? (
                    <div className="space-y-2">
                      {pathItems[path.id].map((item, index) => (
                        <div
                          key={item.id}
                          className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30"
                        >
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
                            {item.completed ? <Check className="h-3.5 w-3.5" /> : index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs sm:text-sm font-medium leading-tight">{item.title}</p>
                            {item.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-2">No steps added yet</p>
                  )}
                </CollapsibleContent>
              </CardContent>
            </Card>
          </Collapsible>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Path</DialogTitle>
            <DialogDescription>Create a manual learning path</DialogDescription>
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
              {loading ? "Creating..." : "Create Path"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Generate Path Dialog */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Learning Path</DialogTitle>
            <DialogDescription>
              AI will synthesize your identity, insights, and experiments into actionable steps
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="focus">Focus Area (optional)</Label>
              <Input
                id="focus"
                value={focusArea}
                onChange={(e) => setFocusArea(e.target.value)}
                placeholder="e.g., business skills, health, charisma..."
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty to generate based on all your data
              </p>
            </div>
            <Button 
              onClick={handleGeneratePath} 
              disabled={generating} 
              className="w-full"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {generating ? "Generating..." : "Generate Path"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Career Redirect Prompt */}
      <CareerRedirectPrompt 
        open={showCareerPrompt}
        onOpenChange={setShowCareerPrompt}
        onContinue={handleCareerPromptContinue}
      />
    </div>
  );
};

export default LearningPaths;
