import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Sparkles, Target } from "lucide-react";

const DailyFocus = () => {
  const { user } = useAuth();
  const [todayTask, setTodayTask] = useState<any>(null);
  const [oneThing, setOneThing] = useState("");
  const [whyMatters, setWhyMatters] = useState("");
  const [reflection, setReflection] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchTodayTask();
  }, [user]);

  const fetchTodayTask = async () => {
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("daily_tasks")
      .select("*")
      .eq("user_id", user!.id)
      .eq("task_date", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!error && data) {
      setTodayTask(data);
      setOneThing(data.one_thing || "");
      setWhyMatters(data.why_matters || "");
      setReflection(data.reflection || "");
    }
  };

  const handleSave = async () => {
    if (!oneThing.trim()) {
      toast.error("Please enter your one thing");
      return;
    }

    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      
      if (todayTask) {
        const { error } = await supabase
          .from("daily_tasks")
          .update({
            one_thing: oneThing,
            why_matters: whyMatters,
            reflection: reflection,
          })
          .eq("id", todayTask.id);

        if (error) throw error;
      } else {
        const { data: insertData, error } = await supabase.from("daily_tasks").insert([{
          user_id: user!.id,
          title: oneThing,
          one_thing: oneThing,
          why_matters: whyMatters,
          reflection: reflection,
          task_date: today,
          completed: false,
        }]).select().single();

        if (error) throw error;
      }

      toast.success("Saved!");
      fetchTodayTask();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleComplete = async () => {
    if (!todayTask) return;

    try {
      const { error } = await supabase
        .from("daily_tasks")
        .update({ completed: !todayTask.completed })
        .eq("id", todayTask.id);

      if (error) throw error;

      fetchTodayTask();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleGenerateDailyOne = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("navigator", {
        body: {}
      });

      if (error) throw error;

      setOneThing(data.one_thing);
      setWhyMatters(data.why_matters);
      toast.success("Generated your daily One Thing!");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Daily Focus</h1>
        <p className="mt-1 text-muted-foreground">
          What's your ONE thing for today?
        </p>
      </div>

      <Card className="bg-gradient-to-br from-primary/5 to-accent/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Today's One Thing</CardTitle>
            <Button 
              onClick={handleGenerateDailyOne}
              disabled={generating}
              variant="outline"
              size="sm"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {generating ? "Generating..." : "Generate My Daily One Thing"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">
              The One Thing
            </label>
            <Textarea
              value={oneThing}
              onChange={(e) => setOneThing(e.target.value)}
              placeholder="What ONE action will you take today? (< 45 minutes)"
              rows={2}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Why It Matters
            </label>
            <Textarea
              value={whyMatters}
              onChange={(e) => setWhyMatters(e.target.value)}
              placeholder="How does this connect to your identity goals and projects?"
              rows={2}
            />
          </div>

          {todayTask && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="completed"
                checked={todayTask.completed}
                onCheckedChange={handleToggleComplete}
              />
              <label
                htmlFor="completed"
                className="cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Completed
              </label>
            </div>
          )}

          {todayTask && todayTask.completed && (
            <div>
              <label className="mb-2 block text-sm font-medium">
                Reflection (optional)
              </label>
              <Textarea
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="What did you learn?"
                rows={2}
              />
            </div>
          )}

          <Button onClick={handleSave} disabled={loading} className="w-full">
            {loading ? "Saving..." : "Save"}
          </Button>
        </CardContent>
      </Card>

      {todayTask && todayTask.completed && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Target className="mb-2 h-12 w-12 text-primary" />
            <h3 className="text-lg font-medium">Well done!</h3>
            <p className="text-sm text-muted-foreground">
              You completed your one thing today.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DailyFocus;