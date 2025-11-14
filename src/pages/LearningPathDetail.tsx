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
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, CheckCircle2, Circle, Lightbulb, FileText, BookOpen, Link as LinkIcon } from "lucide-react";

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
      }
      if (documentIds.length > 0) {
        const { data } = await supabase.from("documents").select("*").in("id", documentIds);
        setDocuments(data || []);
      }
      if (experimentIds.length > 0) {
        const { data } = await (supabase as any).from("experiments").select("*").in("id", experimentIds);
        setExperiments(data || []);
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

  if (!path) return null;

  const connectedInsightIds = insights.map(i => i.id);
  const connectedDocumentIds = documents.map(d => d.id);
  const connectedExperimentIds = experiments.map(e => e.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/paths")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-foreground">{path.title}</h1>
          {path.description && (
            <p className="mt-1 text-muted-foreground">{path.description}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={path.status === "active" ? "default" : "secondary"}>
              {path.status}
            </Badge>
            {path.topics && (
              <Badge
                variant="secondary"
                style={{ backgroundColor: path.topics.color + "20", color: path.topics.color }}
              >
                {path.topics.name}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="items" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="items">Steps ({items.length})</TabsTrigger>
          <TabsTrigger value="insights">Insights ({insights.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="experiments">Experiments ({experiments.length})</TabsTrigger>
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
            <div className="space-y-2">
              {items.map((item) => (
                <Card key={item.id} className={item.completed ? "opacity-60" : ""}>
                  <CardContent className="flex items-start gap-3 p-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleItemComplete(item.id, item.completed)}
                      className="mt-0.5 shrink-0"
                    >
                      {item.completed ? (
                        <CheckCircle2 className="h-5 w-5 text-success" />
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                    </Button>
                    <div className="flex-1">
                      <h3 className={`font-medium ${item.completed ? "line-through" : ""}`}>
                        {item.title}
                      </h3>
                      {item.description && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
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
            <div className="grid gap-4 md:grid-cols-2">
              {insights.map((insight) => (
                <Card key={insight.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{insight.title}</CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDisconnect(insight.id, "insight")}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-3 text-sm text-muted-foreground">
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
            <div className="grid gap-4 md:grid-cols-2">
              {documents.map((doc) => (
                <Card key={doc.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{doc.title}</CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDisconnect(doc.id, "document")}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-3 text-sm text-muted-foreground">
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
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-sm">{exp.title}</CardTitle>
                          <Badge>{exp.status}</Badge>
                        </div>
                        <CardDescription className="text-xs line-clamp-2">{exp.description}</CardDescription>
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
                <BookOpen className="mb-4 h-12 w-12 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">No connected experiments</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {experiments.map((exp) => (
                <Card key={exp.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{exp.title}</CardTitle>
                      <div className="flex gap-2">
                        <Badge>{exp.status}</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDisconnect(exp.id, "experiment")}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {exp.description && (
                      <CardDescription>{exp.description}</CardDescription>
                    )}
                  </CardHeader>
                  {exp.results && (
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Results:</span> {exp.results}
                      </p>
                    </CardContent>
                  )}
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
