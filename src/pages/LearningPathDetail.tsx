import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, CheckCircle2, Circle, Lightbulb, FileText, FlaskConical, Link as LinkIcon, ChevronDown, Layers } from "lucide-react";

const LearningPathDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [path, setPath] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [experiments, setExperiments] = useState<any[]>([]);
  const [availableInsights, setAvailableInsights] = useState<any[]>([]);
  const [availableDocuments, setAvailableDocuments] = useState<any[]>([]);
  const [availableExperiments, setAvailableExperiments] = useState<any[]>([]);
  const [openItemDialog, setOpenItemDialog] = useState(false);
  const [openConnectDialog, setOpenConnectDialog] = useState(false);
  const [connectType, setConnectType] = useState<"insight" | "document" | "experiment">("insight");
  const [itemTitle, setItemTitle] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !id) return;
    fetchPathData();
    fetchAvailableContent();
  }, [user, id]);

  const fetchPathData = async () => {
    const { data: pathData, error: pathError } = await supabase
      .from("learning_paths")
      .select("*, topics(name, color)")
      .eq("id", id)
      .single();

    if (pathError) {
      toast.error("Failed to load learning path");
      navigate("/paths");
      return;
    }

    setPath(pathData);

    // Fetch path items
    const { data: itemsData } = await supabase
      .from("path_items")
      .select("*")
      .eq("path_id", id)
      .order("order_index");
    setItems(itemsData || []);

    // Fetch connected content via connections table
    const { data: connections } = await supabase
      .from("connections")
      .select("*")
      .eq("source_type", "learning_path")
      .eq("source_id", id);

    if (connections) {
      const insightIds = connections.filter(c => c.target_type === "insight").map(c => c.target_id);
      const documentIds = connections.filter(c => c.target_type === "document").map(c => c.target_id);
      const experimentIds = connections.filter(c => c.target_type === "experiment").map(c => c.target_id);

      if (insightIds.length > 0) {
        const { data } = await supabase.from("insights").select("*").in("id", insightIds);
        setInsights(data || []);
      } else {
        setInsights([]);
      }
      if (documentIds.length > 0) {
        const { data } = await supabase.from("documents").select("*").in("id", documentIds);
        setDocuments(data || []);
      } else {
        setDocuments([]);
      }
      if (experimentIds.length > 0) {
        const { data } = await (supabase as any).from("experiments").select("*").in("id", experimentIds);
        setExperiments(data || []);
      } else {
        setExperiments([]);
      }
    }
  };

  const fetchAvailableContent = async () => {
    const topicId = path?.topic_id;
    
    const insightsQuery = supabase.from("insights").select("*").eq("user_id", user!.id);
    if (topicId) insightsQuery.eq("topic_id", topicId);
    const { data: insightsData } = await insightsQuery;
    setAvailableInsights(insightsData || []);

    const docsQuery = supabase.from("documents").select("*").eq("user_id", user!.id);
    if (topicId) docsQuery.eq("topic_id", topicId);
    const { data: docsData } = await docsQuery;
    setAvailableDocuments(docsData || []);

    const expsQuery = (supabase as any).from("experiments").select("*").eq("user_id", user!.id);
    if (topicId) expsQuery.eq("topic_id", topicId);
    const { data: expsData } = await expsQuery;
    setAvailableExperiments(expsData || []);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.order_index)) : 0;
      const { error } = await supabase.from("path_items").insert({
        path_id: id!,
        title: itemTitle,
        description: itemDescription,
        order_index: maxOrder + 1,
        completed: false,
      });

      if (error) throw error;

      toast.success("Item added!");
      setItemTitle("");
      setItemDescription("");
      setOpenItemDialog(false);
      fetchPathData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleItemComplete = async (itemId: string, completed: boolean) => {
    const { error } = await supabase
      .from("path_items")
      .update({ completed: !completed })
      .eq("id", itemId);

    if (error) {
      toast.error("Failed to update item");
      return;
    }

    fetchPathData();
  };

  const handleConnect = async (targetId: string, targetType: string) => {
    try {
      const { error } = await supabase.from("connections").insert({
        user_id: user!.id,
        source_type: "learning_path",
        source_id: id!,
        target_type: targetType,
        target_id: targetId,
      });

      if (error) throw error;

      toast.success("Connected!");
      setOpenConnectDialog(false);
      fetchPathData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDisconnect = async (targetId: string, targetType: string) => {
    try {
      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("source_type", "learning_path")
        .eq("source_id", id!)
        .eq("target_type", targetType)
        .eq("target_id", targetId);

      if (error) throw error;

      toast.success("Disconnected");
      fetchPathData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const toggleItemExpanded = (itemId: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // Get sources that might relate to a step (simple keyword matching)
  const getRelatedSources = (stepTitle: string, stepDescription: string) => {
    const stepText = `${stepTitle} ${stepDescription}`.toLowerCase();
    const words = stepText.split(/\s+/).filter(w => w.length > 4);
    
    const relatedInsights = insights.filter(i => {
      const insightText = `${i.title} ${i.content}`.toLowerCase();
      return words.some(w => insightText.includes(w));
    });

    const relatedDocs = documents.filter(d => {
      const docText = `${d.title} ${d.summary || ''}`.toLowerCase();
      return words.some(w => docText.includes(w));
    });

    const relatedExps = experiments.filter(e => {
      const expText = `${e.title} ${e.description || ''}`.toLowerCase();
      return words.some(w => expText.includes(w));
    });

    return { relatedInsights, relatedDocs, relatedExps };
  };

  if (!path) return null;

  const connectedInsightIds = insights.map(i => i.id);
  const connectedDocumentIds = documents.map(d => d.id);
  const connectedExperimentIds = experiments.map(e => e.id);
  
  const totalSources = insights.length + documents.length + experiments.length;
  const completedSteps = items.filter(i => i.completed).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3 sm:gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/paths")} className="shrink-0 mt-1">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold text-foreground leading-tight">{path.title}</h1>
          {path.description && (
            <p className="mt-1 text-sm sm:text-base text-muted-foreground line-clamp-2">{path.description}</p>
          )}
          <div className="mt-2 flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <Badge variant={path.status === "active" ? "default" : "secondary"} className="text-xs">
              {path.status}
            </Badge>
            {path.topics && (
              <Badge
                variant="secondary"
                className="text-xs"
                style={{ backgroundColor: path.topics.color + "20", color: path.topics.color }}
              >
                {path.topics.name}
              </Badge>
            )}
            {totalSources > 0 && (
              <Badge variant="outline" className="gap-1 text-xs hidden sm:inline-flex">
                <Layers className="h-3 w-3" />
                {totalSources} source{totalSources !== 1 ? 's' : ''}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {completedSteps}/{items.length} done
            </Badge>
          </div>
        </div>
      </div>

      <Tabs defaultValue="items" className="space-y-3 sm:space-y-4">
        <TabsList className="grid w-full grid-cols-4 h-auto">
          <TabsTrigger value="items" className="text-xs sm:text-sm px-1 sm:px-3 py-2">
            <span className="hidden sm:inline">Steps</span>
            <span className="sm:hidden">Steps</span>
            <span className="ml-1">({items.length})</span>
          </TabsTrigger>
          <TabsTrigger value="insights" className="text-xs sm:text-sm px-1 sm:px-3 py-2">
            <span className="hidden sm:inline">Insights</span>
            <span className="sm:hidden">Ins</span>
            <span className="ml-1">({insights.length})</span>
          </TabsTrigger>
          <TabsTrigger value="documents" className="text-xs sm:text-sm px-1 sm:px-3 py-2">
            <span className="hidden sm:inline">Documents</span>
            <span className="sm:hidden">Docs</span>
            <span className="ml-1">({documents.length})</span>
          </TabsTrigger>
          <TabsTrigger value="experiments" className="text-xs sm:text-sm px-1 sm:px-3 py-2">
            <span className="hidden sm:inline">Experiments</span>
            <span className="sm:hidden">Exp</span>
            <span className="ml-1">({experiments.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={openItemDialog} onOpenChange={setOpenItemDialog}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Step
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Learning Step</DialogTitle>
                  <DialogDescription>
                    Define a milestone or step in your learning journey
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddItem} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="item-title">Title</Label>
                    <Input
                      id="item-title"
                      placeholder="e.g., Complete React hooks tutorial"
                      value={itemTitle}
                      onChange={(e) => setItemTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="item-description">Description (optional)</Label>
                    <Textarea
                      id="item-description"
                      placeholder="Additional details..."
                      value={itemDescription}
                      onChange={(e) => setItemDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Adding..." : "Add Step"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Circle className="mb-4 h-12 w-12 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">No steps yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {items.map((item) => {
                const { relatedInsights, relatedDocs, relatedExps } = getRelatedSources(item.title, item.description || '');
                const hasSources = relatedInsights.length > 0 || relatedDocs.length > 0 || relatedExps.length > 0;
                const isExpanded = expandedItems.has(item.id);

                return (
                  <Card key={item.id} className={item.completed ? "opacity-60" : ""}>
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-start gap-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleItemComplete(item.id, item.completed)}
                          className="mt-0.5 shrink-0"
                        >
                          {item.completed ? (
                            <CheckCircle2 className="h-5 w-5 text-primary" />
                          ) : (
                            <Circle className="h-5 w-5" />
                          )}
                        </Button>
                        <div className="flex-1 min-w-0">
                          <h3 className={`font-medium ${item.completed ? "line-through" : ""}`}>
                            {item.title}
                          </h3>
                          {item.description && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {item.description}
                            </p>
                          )}
                          
                          {hasSources && (
                            <Collapsible open={isExpanded} onOpenChange={() => toggleItemExpanded(item.id)}>
                              <CollapsibleTrigger asChild>
                                <button className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                  <LinkIcon className="h-3 w-3" />
                                  <span>
                                    {relatedInsights.length + relatedDocs.length + relatedExps.length} related source{relatedInsights.length + relatedDocs.length + relatedExps.length !== 1 ? 's' : ''}
                                  </span>
                                  <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-2 space-y-1">
                                {relatedInsights.map(insight => (
                                  <div key={insight.id} className="flex items-center gap-2 text-xs text-muted-foreground pl-1">
                                    <Lightbulb className="h-3 w-3 text-yellow-500" />
                                    <span className="truncate">{insight.title}</span>
                                  </div>
                                ))}
                                {relatedDocs.map(doc => (
                                  <div key={doc.id} className="flex items-center gap-2 text-xs text-muted-foreground pl-1">
                                    <FileText className="h-3 w-3 text-blue-500" />
                                    <span className="truncate">{doc.title}</span>
                                  </div>
                                ))}
                                {relatedExps.map(exp => (
                                  <div key={exp.id} className="flex items-center gap-2 text-xs text-muted-foreground pl-1">
                                    <FlaskConical className="h-3 w-3 text-purple-500" />
                                    <span className="truncate">{exp.title}</span>
                                  </div>
                                ))}
                              </CollapsibleContent>
                            </Collapsible>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={openConnectDialog && connectType === "insight"} onOpenChange={(open) => {
              setOpenConnectDialog(open);
              if (open) setConnectType("insight");
            }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Connect Insight
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Connect Insight</DialogTitle>
                  <DialogDescription>
                    Link an insight to this learning path
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {availableInsights.filter(i => !connectedInsightIds.includes(i.id)).map((insight) => (
                    <Card key={insight.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleConnect(insight.id, "insight")}>
                      <CardHeader className="p-4">
                        <CardTitle className="text-sm">{insight.title}</CardTitle>
                        <CardDescription className="text-xs line-clamp-2">{insight.content}</CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {insights.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Lightbulb className="mb-4 h-12 w-12 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">No connected insights</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              {insights.map((insight) => (
                <Card key={insight.id}>
                  <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base sm:text-lg leading-tight">{insight.title}</CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDisconnect(insight.id, "insight")}
                        className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
                    <p className="line-clamp-2 sm:line-clamp-3 text-xs sm:text-sm text-muted-foreground">
                      {insight.content}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={openConnectDialog && connectType === "document"} onOpenChange={(open) => {
              setOpenConnectDialog(open);
              if (open) setConnectType("document");
            }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Connect Document
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Connect Document</DialogTitle>
                  <DialogDescription>
                    Link a document to this learning path
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {availableDocuments.filter(d => !connectedDocumentIds.includes(d.id)).map((doc) => (
                    <Card key={doc.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleConnect(doc.id, "document")}>
                      <CardHeader className="p-4">
                        <CardTitle className="text-sm">{doc.title}</CardTitle>
                        <CardDescription className="text-xs line-clamp-2">{doc.summary || "No summary"}</CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {documents.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="mb-4 h-12 w-12 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">No connected documents</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              {documents.map((doc) => (
                <Card key={doc.id}>
                  <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base sm:text-lg leading-tight">{doc.title}</CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDisconnect(doc.id, "document")}
                        className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
                    <p className="line-clamp-2 sm:line-clamp-3 text-xs sm:text-sm text-muted-foreground">
                      {doc.summary || "No summary"}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="experiments" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={openConnectDialog && connectType === "experiment"} onOpenChange={(open) => {
              setOpenConnectDialog(open);
              if (open) setConnectType("experiment");
            }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Connect Experiment
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Connect Experiment</DialogTitle>
                  <DialogDescription>
                    Link an experiment to this learning path
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {availableExperiments.filter(e => !connectedExperimentIds.includes(e.id)).map((exp) => (
                    <Card key={exp.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleConnect(exp.id, "experiment")}>
                      <CardHeader className="p-4">
                        <CardTitle className="text-sm">{exp.title}</CardTitle>
                        <CardDescription className="text-xs line-clamp-2">{exp.description || "No description"}</CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {experiments.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FlaskConical className="mb-4 h-12 w-12 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">No connected experiments</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              {experiments.map((exp) => (
                <Card key={exp.id}>
                  <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base sm:text-lg leading-tight">{exp.title}</CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDisconnect(exp.id, "experiment")}
                        className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
                    <p className="line-clamp-2 sm:line-clamp-3 text-xs sm:text-sm text-muted-foreground">
                      {exp.description || "No description"}
                    </p>
                    {exp.status && (
                      <Badge variant="outline" className="mt-2 text-xs">
                        {exp.status}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LearningPathDetail;
