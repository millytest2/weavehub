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
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Paths</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Areas you're expanding in
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setGenerateDialogOpen(true)} disabled={generating} size="sm" variant="outline">
            <Sparkles className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Generate</span>
          </Button>
          <Button onClick={() => setIsDialogOpen(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Add Path</span>
          </Button>
        </div>
      </div>

      {/* Paths Grid */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {paths.map((path) => (
          <Card 
            key={path.id}
            className="rounded-[10px] border-border/30 hover:shadow-lg hover:border-primary/50 transition-all duration-200"
          >
            <Collapsible
              open={expandedPaths[path.id]}
              onOpenChange={() => togglePath(path.id)}
            >
              <CardContent className="pt-5 pb-5">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <CollapsibleTrigger asChild>
                      <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors">
                        {expandedPaths[path.id] ? (
                          <ChevronDown className="h-4 w-4 text-primary" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-primary" />
                        )}
                      </button>
                    </CollapsibleTrigger>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-base mb-1">{path.title}</h3>
                      {path.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{path.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/paths/${path.id}`)}
                        className="h-8 w-8 p-0"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(path.id)}
                        className="h-8 w-8 p-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <CollapsibleContent>
                    <div className="pl-11 space-y-1.5 pt-2 border-t border-border/30">
                      {pathItems[path.id]?.length > 0 ? (
                        pathItems[path.id].map((item, index) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 py-1 text-sm"
                          >
                            <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs ${
                              item.completed ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                            }`}>
                              {item.completed ? <Check className="h-3 w-3" /> : index + 1}
                            </span>
                            <span className={item.completed ? 'text-muted-foreground line-through' : ''}>
                              {item.title}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground py-2">No steps yet</p>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </CardContent>
            </Collapsible>
          </Card>
        ))}
      </div>

      {paths.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground mb-4">No paths yet</p>
          <Button onClick={() => setGenerateDialogOpen(true)} variant="outline" size="sm">
            <Sparkles className="mr-2 h-4 w-4" />
            Generate your first path
          </Button>
        </div>
      )}

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
