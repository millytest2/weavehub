import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, FileText, Map, Lightbulb, Sparkles } from "lucide-react";

const TopicDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [topic, setTopic] = useState<any>(null);
  const [insights, setInsights] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [paths, setPaths] = useState<any[]>([]);
  const [experiments, setExperiments] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    fetchTopicData();
  }, [user, id]);

  const fetchTopicData = async () => {
    // Fetch topic
    const { data: topicData, error: topicError } = await supabase
      .from("topics")
      .select("*")
      .eq("id", id)
      .single();

    if (topicError) {
      toast.error("Failed to load topic");
      navigate("/topics");
      return;
    }

    setTopic(topicData);

    // Fetch related data
    const [insightsRes, docsRes, pathsRes, expsRes] = await Promise.all([
      supabase.from("insights").select("*").eq("topic_id", id).order("created_at", { ascending: false }),
      supabase.from("documents").select("*").eq("topic_id", id).order("created_at", { ascending: false }),
      supabase.from("learning_paths").select("*, path_items(count)").eq("topic_id", id).order("created_at", { ascending: false }),
      supabase.from("experiments").select("*").eq("topic_id", id).order("created_at", { ascending: false }),
    ]);

    setInsights(insightsRes.data || []);
    setDocuments(docsRes.data || []);
    setPaths(pathsRes.data || []);
    setExperiments(expsRes.data || []);
  };

  const handleGetSuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("daily-suggestions", {
        body: { topicId: id },
      });

      if (error) throw error;

      setSuggestions(data.suggestions || []);
      toast.success("Got AI suggestions!");
    } catch (error: any) {
      toast.error(error.message || "Failed to get suggestions");
    } finally {
      setLoading(false);
    }
  };

  if (!topic) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/topics")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <div className="h-12 w-12 rounded-full" style={{ backgroundColor: topic.color }} />
          <div>
            <h1 className="text-3xl font-bold text-foreground">{topic.name}</h1>
            <p className="text-muted-foreground">{topic.description}</p>
          </div>
        </div>
        <Button onClick={handleGetSuggestions} disabled={loading}>
          <Sparkles className="mr-2 h-4 w-4" />
          {loading ? "Generating..." : "Get AI Suggestions"}
        </Button>
      </div>

      {suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Suggestions for Today
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestions.map((sug, idx) => (
              <div key={idx} className="flex gap-3 p-3 rounded-lg bg-muted/50">
                <Badge variant={sug.priority === "high" ? "default" : "secondary"}>
                  {sug.priority}
                </Badge>
                <div className="flex-1">
                  <p className="font-medium">{sug.title}</p>
                  <p className="text-sm text-muted-foreground">{sug.description}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="insights" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="insights">
            Insights ({insights.length})
          </TabsTrigger>
          <TabsTrigger value="documents">
            Documents ({documents.length})
          </TabsTrigger>
          <TabsTrigger value="paths">
            Paths ({paths.length})
          </TabsTrigger>
          <TabsTrigger value="experiments">
            Experiments ({experiments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="space-y-4">
          {insights.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Lightbulb className="mb-4 h-12 w-12 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">No insights yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {insights.map((insight) => (
                <Card key={insight.id}>
                  <CardHeader>
                    <CardTitle className="text-lg">{insight.title}</CardTitle>
                    <CardDescription>
                      {new Date(insight.created_at).toLocaleDateString()}
                    </CardDescription>
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
          {documents.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="mb-4 h-12 w-12 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">No documents yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {documents.map((doc) => (
                <Card key={doc.id}>
                  <CardHeader>
                    <CardTitle className="text-lg">{doc.title}</CardTitle>
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

        <TabsContent value="paths" className="space-y-4">
          {paths.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Map className="mb-4 h-12 w-12 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">No learning paths yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {paths.map((path) => (
                <Card key={path.id}>
                  <CardHeader>
                    <CardTitle className="text-lg">{path.title}</CardTitle>
                    <CardDescription>
                      {path.path_items?.[0]?.count || 0} items · {path.status}
                    </CardDescription>
                  </CardHeader>
                  {path.description && (
                    <CardContent>
                      <p className="line-clamp-3 text-sm text-muted-foreground">
                        {path.description}
                      </p>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="experiments" className="space-y-4">
          {experiments.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BookOpen className="mb-4 h-12 w-12 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">No experiments yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {experiments.map((exp) => (
                <Card key={exp.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{exp.title}</CardTitle>
                      <Badge>{exp.status}</Badge>
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

export default TopicDetail;