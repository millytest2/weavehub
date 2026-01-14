import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  Copy, 
  Check, 
  Sparkles,
  Loader2,
  Download
} from "lucide-react";

interface UserGoal {
  id: string;
  domain: string;
  goal_name: string;
  target_value: number;
  current_value: number;
  unit: string;
}

interface MetricLog {
  id: string;
  goal_id: string;
  value: number;
  notes: string | null;
  logged_at: string;
  week_number: number;
  year: number;
}

interface WeeklyExportGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekNumber: number;
  year: number;
}

const DOMAIN_ORDER = ['business', 'body', 'content', 'relationship', 'mind', 'play'];

export function WeeklyExportGenerator({ 
  open, 
  onOpenChange, 
  weekNumber, 
  year 
}: WeeklyExportGeneratorProps) {
  const { user } = useAuth();
  const [exportText, setExportText] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [goals, setGoals] = useState<UserGoal[]>([]);
  const [currentLogs, setCurrentLogs] = useState<MetricLog[]>([]);
  const [previousLogs, setPreviousLogs] = useState<MetricLog[]>([]);

  useEffect(() => {
    if (open && user) {
      fetchDataAndGenerate();
    }
  }, [open, user]);

  const fetchDataAndGenerate = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch goals
      const { data: goalsData, error: goalsError } = await supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", user.id);

      if (goalsError) throw goalsError;
      if (!goalsData || goalsData.length === 0) {
        toast.error("No goals found. Complete a weekly check-in first.");
        onOpenChange(false);
        return;
      }

      setGoals(goalsData);

      // Fetch logs for current week
      const { data: currentLogsData, error: currentError } = await supabase
        .from("metric_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("week_number", weekNumber)
        .eq("year", year);

      if (currentError) throw currentError;
      setCurrentLogs(currentLogsData || []);

      // Fetch logs for previous week
      const prevWeek = weekNumber === 1 ? 52 : weekNumber - 1;
      const prevYear = weekNumber === 1 ? year - 1 : year;
      
      const { data: previousLogsData, error: prevError } = await supabase
        .from("metric_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("week_number", prevWeek)
        .eq("year", prevYear);

      if (prevError) throw prevError;
      setPreviousLogs(previousLogsData || []);

      // Generate the export
      generateExport(goalsData, currentLogsData || [], previousLogsData || []);

    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const generateExport = (
    goals: UserGoal[], 
    currentLogs: MetricLog[], 
    previousLogs: MetricLog[]
  ) => {
    // Create lookup maps
    const currentLogsByGoal = new Map(currentLogs.map(l => [l.goal_id, l]));
    const previousLogsByGoal = new Map(previousLogs.map(l => [l.goal_id, l]));

    // Sort goals by domain order
    const sortedGoals = [...goals].sort((a, b) => 
      DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain)
    );

    // Build the export text
    let lines: string[] = [];
    lines.push(`Week ${weekNumber} Integration:`);
    lines.push("");

    for (const goal of sortedGoals) {
      const currentLog = currentLogsByGoal.get(goal.id);
      const previousLog = previousLogsByGoal.get(goal.id);
      
      const currentValue = currentLog?.value ?? goal.current_value ?? 0;
      const previousValue = previousLog?.value ?? 0;
      const change = currentValue - previousValue;
      const progress = goal.target_value > 0 
        ? Math.round((currentValue / goal.target_value) * 100) 
        : 0;

      const changeStr = change !== 0 
        ? ` (${change >= 0 ? '+' : ''}${formatNumber(change)} this week)` 
        : '';

      const domainLabel = goal.domain.charAt(0).toUpperCase() + goal.domain.slice(1);
      const line = `${domainLabel}: ${goal.goal_name} ${formatNumber(currentValue)}${goal.unit ? ` ${goal.unit}` : ''} / ${formatNumber(goal.target_value)}${goal.unit ? ` ${goal.unit}` : ''} (${progress}%)${changeStr}`;
      
      lines.push(line);

      // Add notes if present
      if (currentLog?.notes) {
        lines.push(`  → ${currentLog.notes}`);
      }
    }

    lines.push("");
    lines.push(`Week ${weekNumber}/52. All domains compound.`);

    setExportText(lines.join("\n"));
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(exportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard!");
  };

  const handleGeneratePattern = async () => {
    if (!user) return;
    setGenerating(true);

    try {
      // Prepare data for AI
      const weekData = goals.map(goal => {
        const currentLog = currentLogs.find(l => l.goal_id === goal.id);
        return {
          domain: goal.domain,
          goal_name: goal.goal_name,
          current: currentLog?.value ?? goal.current_value ?? 0,
          target: goal.target_value,
          unit: goal.unit,
          notes: currentLog?.notes
        };
      });

      const { data, error } = await supabase.functions.invoke("synthesizer", {
        body: {
          mode: "weekly_pattern",
          week_number: weekNumber,
          metrics: weekData
        }
      });

      if (error) throw error;

      if (data?.pattern) {
        // Append pattern to export
        setExportText(prev => {
          const lines = prev.split("\n");
          // Insert before the last line
          const lastLine = lines.pop();
          lines.push("");
          lines.push(`Pattern: ${data.pattern}`);
          if (data.target) {
            lines.push(`Target: ${data.target}`);
          }
          lines.push("");
          lines.push(lastLine || "");
          return lines.join("\n");
        });
      }

    } catch (error) {
      console.error("Error generating pattern:", error);
      toast.error("Failed to generate pattern");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Generating export...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Week {weekNumber} Export
          </DialogTitle>
          <DialogDescription>
            Copy-paste ready for your Sunday thread
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea 
            value={exportText}
            onChange={(e) => setExportText(e.target.value)}
            rows={12}
            className="font-mono text-sm"
          />
          
          <div className="flex gap-2">
            <Button onClick={handleCopy} variant="outline" className="flex-1">
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </>
              )}
            </Button>
            <Button 
              onClick={handleGeneratePattern}
              variant="outline"
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Add Pattern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
