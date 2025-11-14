import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

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
        const { error } = await supabase.from("daily_tasks").insert([{
          user_id: user!.id,
          title: oneThing,
          one_thing: oneThing,
          why_matters: whyMatters,
          reflection: reflection,
          task_date: today,
          completed: false,
        }]);

        if (error) throw error;
      }

      toast.success("Saved");
      fetchTodayTask();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDailyOne = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("navigator");

      if (error) throw error;

      setOneThing(data.one_thing);
      setWhyMatters(data.why_matters);
      toast.success("Generated your daily focus");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-medium">Daily Focus</h1>
        <p className="text-muted-foreground mt-2">
          What's your one thing today?
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Your One Thing</label>
            <Textarea
              placeholder="What's the one thing that matters most today?"
              value={oneThing}
              onChange={(e) => setOneThing(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Why It Matters</label>
            <Textarea
              placeholder="Why is this important?"
              value={whyMatters}
              onChange={(e) => setWhyMatters(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Reflection</label>
            <Textarea
              placeholder="End-of-day reflection..."
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleGenerateDailyOne} disabled={generating} variant="outline" size="sm">
              <Sparkles className="mr-2 h-4 w-4" />
              {generating ? "Generating..." : "Generate"}
            </Button>
            <Button onClick={handleSave} disabled={loading} size="sm">
              {loading ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DailyFocus;
