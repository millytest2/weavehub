import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, ListTodo, Trash2 } from "lucide-react";

const DailyFocus = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [newTask, setNewTask] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchTasks();
  }, [user]);

  const fetchTasks = async () => {
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("daily_tasks")
      .select("*")
      .eq("user_id", user!.id)
      .eq("task_date", today)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Failed to load tasks");
      return;
    }

    setTasks(data || []);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;

    setLoading(true);

    try {
      const today = new Date().toISOString().split("T")[0];
      const { error } = await supabase.from("daily_tasks").insert({
        user_id: user!.id,
        title: newTask,
        task_date: today,
        completed: false,
      });

      if (error) throw error;

      setNewTask("");
      fetchTasks();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id: string, completed: boolean) => {
    try {
      const { error } = await supabase
        .from("daily_tasks")
        .update({ completed: !completed })
        .eq("id", id);

      if (error) throw error;

      fetchTasks();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("daily_tasks").delete().eq("id", id);

      if (error) throw error;

      fetchTasks();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Daily Focus</h1>
        <p className="mt-1 text-muted-foreground">
          What are you working on today?
        </p>
      </div>

      {/* Progress Card */}
      <Card className="bg-gradient-to-br from-primary/5 to-accent/5">
        <CardHeader>
          <CardTitle className="text-lg">Today's Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Completed</span>
                <span className="font-medium">
                  {completedCount} / {totalCount}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                  style={{
                    width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Task */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleCreate} className="flex gap-2">
            <Input
              placeholder="Add a task for today..."
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              disabled={loading}
            />
            <Button type="submit" disabled={loading}>
              <Plus className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Tasks List */}
      {tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ListTodo className="mb-4 h-16 w-16 text-muted-foreground opacity-20" />
            <h3 className="text-lg font-medium">No tasks for today</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first task to get started
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-4 transition-colors hover:bg-secondary/50"
                >
                  <Checkbox
                    checked={task.completed}
                    onCheckedChange={() => handleToggle(task.id, task.completed)}
                  />
                  <span
                    className={`flex-1 text-sm ${
                      task.completed
                        ? "text-muted-foreground line-through"
                        : "text-foreground"
                    }`}
                  >
                    {task.title}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(task.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DailyFocus;
