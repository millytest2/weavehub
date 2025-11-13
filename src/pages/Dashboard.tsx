import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lightbulb, FileText, Map, TrendingUp, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    insights: 0,
    documents: 0,
    paths: 0,
    todayTasks: 0,
  });
  const [recentInsights, setRecentInsights] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const [insightsRes, docsRes, pathsRes, tasksRes, recentRes] = await Promise.all([
        supabase.from("insights").select("id", { count: "exact" }).eq("user_id", user.id),
        supabase.from("documents").select("id", { count: "exact" }).eq("user_id", user.id),
        supabase.from("learning_paths").select("id", { count: "exact" }).eq("user_id", user.id),
        supabase
          .from("daily_tasks")
          .select("id", { count: "exact" })
          .eq("user_id", user.id)
          .eq("task_date", new Date().toISOString().split("T")[0]),
        supabase
          .from("insights")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      setStats({
        insights: insightsRes.count || 0,
        documents: docsRes.count || 0,
        paths: pathsRes.count || 0,
        todayTasks: tasksRes.count || 0,
      });

      setRecentInsights(recentRes.data || []);
    };

    fetchData();
  }, [user]);

  const statCards = [
    {
      title: "Insights Captured",
      value: stats.insights,
      icon: Lightbulb,
      color: "text-accent",
      href: "/insights",
    },
    {
      title: "Documents",
      value: stats.documents,
      icon: FileText,
      color: "text-primary",
      href: "/documents",
    },
    {
      title: "Learning Paths",
      value: stats.paths,
      icon: Map,
      color: "text-success",
      href: "/paths",
    },
    {
      title: "Today's Tasks",
      value: stats.todayTasks,
      icon: TrendingUp,
      color: "text-accent",
      href: "/daily",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Welcome Back</h1>
        <p className="mt-1 text-muted-foreground">
          Here's your knowledge hub overview
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card
            key={stat.title}
            className="cursor-pointer transition-all hover:shadow-md"
            onClick={() => navigate(stat.href)}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Insights */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Insights</CardTitle>
            <CardDescription>Your latest captured thoughts</CardDescription>
          </div>
          <Button onClick={() => navigate("/insights")}>
            <Plus className="mr-2 h-4 w-4" />
            Add Insight
          </Button>
        </CardHeader>
        <CardContent>
          {recentInsights.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Lightbulb className="mx-auto mb-2 h-12 w-12 opacity-20" />
              <p>No insights yet. Start capturing your thoughts!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentInsights.map((insight) => (
                <div
                  key={insight.id}
                  className="rounded-lg border border-border bg-secondary/50 p-4 transition-all hover:bg-secondary"
                >
                  <h3 className="font-medium text-foreground">{insight.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {insight.content}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(insight.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Get started with common tasks</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Button
            variant="outline"
            className="h-auto flex-col gap-2 py-4"
            onClick={() => navigate("/insights")}
          >
            <Lightbulb className="h-6 w-6" />
            <span>Capture Insight</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto flex-col gap-2 py-4"
            onClick={() => navigate("/documents")}
          >
            <FileText className="h-6 w-6" />
            <span>Upload Document</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto flex-col gap-2 py-4"
            onClick={() => navigate("/paths")}
          >
            <Map className="h-6 w-6" />
            <span>Create Learning Path</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
