import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { 
  Briefcase, 
  Activity, 
  FileText, 
  Heart, 
  Brain, 
  Gamepad2,
  CheckCircle2,
  Circle,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Flame,
  Calendar,
  Plus,
  Loader2,
  Send,
  Mic,
  MicOff,
  Target,
  Settings,
  Wand2,
  AlertTriangle,
  Mountain,
  Compass,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, addWeeks, subWeeks, getWeek, getYear, startOfMonth, endOfMonth, differenceInWeeks, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { useVoiceCaptureWebSpeech } from "@/hooks/useVoiceCaptureWebSpeech";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ActionHistory {
  id: string;
  action_text: string;
  action_date: string;
  pillar: string | null;
  completed_at: string;
}

interface WeeklyIntegration {
  id: string;
  week_number: number;
  year: number;
  business_score: number | null;
  body_score: number | null;
  content_score: number | null;
  relationship_score: number | null;
  mind_score: number | null;
  play_score: number | null;
}

interface PillarTarget {
  id: string;
  pillar: string;
  weekly_target: number;
  priority: number;
  notes: string | null;
}

const PILLAR_CONFIG: Record<string, { label: string; icon: any; color: string; bgColor: string }> = {
  business: { label: 'Business', icon: Briefcase, color: 'text-blue-500', bgColor: 'bg-blue-500' },
  body: { label: 'Body', icon: Activity, color: 'text-green-500', bgColor: 'bg-green-500' },
  content: { label: 'Content', icon: FileText, color: 'text-purple-500', bgColor: 'bg-purple-500' },
  relationship: { label: 'Relationship', icon: Heart, color: 'text-pink-500', bgColor: 'bg-pink-500' },
  mind: { label: 'Mind', icon: Brain, color: 'text-orange-500', bgColor: 'bg-orange-500' },
  play: { label: 'Play', icon: Gamepad2, color: 'text-cyan-500', bgColor: 'bg-cyan-500' },
};

const DEFAULT_PILLAR_TARGETS: Record<string, { target: number; priority: number }> = {
  business: { target: 5, priority: 5 },
  body: { target: 5, priority: 4 },
  content: { target: 3, priority: 3 },
  relationship: { target: 3, priority: 3 },
  mind: { target: 3, priority: 2 },
  play: { target: 2, priority: 1 },
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface WeeklyRhythmViewProps {
  onCheckin: () => void;
}

export function WeeklyRhythmView({ onCheckin }: WeeklyRhythmViewProps) {
  const { user } = useAuth();
  const [viewDate, setViewDate] = useState(new Date());
  const [actions, setActions] = useState<ActionHistory[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyIntegration | null>(null);
  const [prevWeekData, setPrevWeekData] = useState<WeeklyIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [pillarScope, setPillarScope] = useState<'day' | 'week'>('day');
  
  // Pillar targets state
  const [pillarTargets, setPillarTargets] = useState<Record<string, PillarTarget>>({});
  const [showTargetsDialog, setShowTargetsDialog] = useState(false);
  const [editingTargets, setEditingTargets] = useState<Record<string, { target: number; priority: number; reasoning?: string }>>({});
  const [savingTargets, setSavingTargets] = useState(false);
  const [generatingTargets, setGeneratingTargets] = useState(false);
  const [autoAdjusting, setAutoAdjusting] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiAlert, setAiAlert] = useState<string | null>(null);
  const [adjustmentStats, setAdjustmentStats] = useState<{ pillar: string; target: number; completed: number; completionRate: number }[] | null>(null);
  
  // Quick log state
  const [logInput, setLogInput] = useState("");
  const [selectedPillar, setSelectedPillar] = useState<string | null>(null);
  const [isLogging, setIsLogging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedItems, setParsedItems] = useState<{ text: string; pillar: string | null }[]>([]);
  const [showParsedPreview, setShowParsedPreview] = useState(false);
  
  // Monthly/Misogi state
  const [identitySeed, setIdentitySeed] = useState<{ content: string; core_values: string; year_note: string } | null>(null);
  const [monthlyInsightsExpanded, setMonthlyInsightsExpanded] = useState(false);
  const [generatingMonthlyInsight, setGeneratingMonthlyInsight] = useState(false);
  const [monthlyInsight, setMonthlyInsight] = useState<string | null>(null);
  
  // Parse voice transcript into structured items
  const parseVoiceTranscript = async (transcript: string) => {
    setIsParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-voice-log', {
        body: { transcript }
      });
      
      if (error) throw error;
      
      if (data?.completed?.length > 0 || data?.planned?.length > 0) {
        setParsedItems(data.completed || []);
        setShowParsedPreview(true);
        toast.success(`Found ${data.completed?.length || 0} completed items`);
      } else {
        // Fallback to raw transcript
        setLogInput(transcript);
        toast.info("Couldn't parse - using raw text");
      }
    } catch (error) {
      console.error("Error parsing voice:", error);
      setLogInput(transcript);
      toast.error("Parse failed - using raw text");
    } finally {
      setIsParsing(false);
    }
  };
  
  // Voice capture for quick log - using Web Speech API (browser-based, no API needed)
  const { 
    isRecording, 
    isTranscribing, 
    formattedDuration,
    interimTranscript,
    toggleRecording,
    isSupported: voiceSupported
  } = useVoiceCaptureWebSpeech({
    maxDuration: 120, // 2 minutes max
    onTranscript: (text) => {
      // Send to AI for parsing
      parseVoiceTranscript(text);
    }
  });
  
  // Log all parsed items at once
  const handleLogParsedItems = async () => {
    if (!user || parsedItems.length === 0) return;
    
    setIsLogging(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const inserts = parsedItems.map(item => ({
        user_id: user.id,
        action_text: item.text,
        action_date: today,
        pillar: item.pillar,
        completed_at: new Date().toISOString(),
      }));
      
      const { error } = await supabase.from("action_history").insert(inserts);
      if (error) throw error;
      
      toast.success(`Logged ${parsedItems.length} items!`);
      setParsedItems([]);
      setShowParsedPreview(false);
      setLogInput("");
      fetchWeekData();
    } catch (error) {
      console.error("Error logging items:", error);
      toast.error("Failed to log items");
    } finally {
      setIsLogging(false);
    }
  };
  
  // Remove a parsed item before logging
  const removeParsedItem = (index: number) => {
    setParsedItems(prev => prev.filter((_, i) => i !== index));
  };

  const weekStart = startOfWeek(viewDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(viewDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const currentWeekNumber = getWeek(viewDate, { weekStartsOn: 1 });
  const currentYear = getYear(viewDate);
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }));

  const handleQuickLog = async () => {
    if (!user || !logInput.trim()) return;
    
    // If no pillar selected, auto-parse the text to break it into multiple items with pillars
    if (!selectedPillar) {
      await parseVoiceTranscript(logInput.trim());
      setLogInput("");
      return;
    }
    
    // If pillar is selected, log as single item
    setIsLogging(true);
    try {
      const { error } = await supabase.from("action_history").insert({
        user_id: user.id,
        action_text: logInput.trim(),
        action_date: format(new Date(), 'yyyy-MM-dd'),
        pillar: selectedPillar,
        completed_at: new Date().toISOString(),
      });

      if (error) throw error;

      toast.success("Logged!");
      setLogInput("");
      setSelectedPillar(null);
      fetchWeekData(); // Refresh the data
    } catch (error) {
      console.error("Error logging action:", error);
      toast.error("Failed to log action");
    } finally {
      setIsLogging(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchWeekData();
    }
  }, [user, viewDate]);

  // Auto-adjust targets weekly on Sunday/Monday (check once per session)
  useEffect(() => {
    if (!user || !isCurrentWeek) return;
    
    const checkWeeklyAutoAdjust = async () => {
      const dayOfWeek = new Date().getDay(); // 0 = Sunday, 1 = Monday
      if (dayOfWeek !== 0 && dayOfWeek !== 1) return; // Only on Sun/Mon
      
      const lastAutoAdjustKey = `lastAutoAdjust_${user.id}`;
      const lastAdjust = localStorage.getItem(lastAutoAdjustKey);
      const now = new Date();
      const weekId = `${getYear(now)}-${getWeek(now, { weekStartsOn: 1 })}`;
      
      if (lastAdjust === weekId) return; // Already adjusted this week
      
      console.log("Running weekly auto-adjust check...");
      try {
        const { data, error } = await supabase.functions.invoke('auto-adjust-targets');
        if (error) throw error;
        
        if (data.adjustments?.length > 0) {
          toast.info(`Targets auto-adjusted: ${data.summary}`, { duration: 5000 });
          fetchWeekData(); // Refresh to show new targets
        }
        
        localStorage.setItem(lastAutoAdjustKey, weekId);
      } catch (error) {
        console.error("Auto-adjust check failed:", error);
      }
    };
    
    // Run after a short delay to not block initial load
    const timer = setTimeout(checkWeeklyAutoAdjust, 2000);
    return () => clearTimeout(timer);
  }, [user, isCurrentWeek]);

  const fetchWeekData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const startDate = format(weekStart, 'yyyy-MM-dd');
      const endDate = format(weekEnd, 'yyyy-MM-dd');
      const prevWeekNum = currentWeekNumber === 1 ? 52 : currentWeekNumber - 1;
      const prevYear = currentWeekNumber === 1 ? currentYear - 1 : currentYear;

      const [actionsResult, weeklyResult, prevWeekResult, targetsResult, identityResult] = await Promise.all([
        supabase
          .from("action_history")
          .select("*")
          .eq("user_id", user.id)
          .gte("action_date", startDate)
          .lte("action_date", endDate)
          .order("completed_at", { ascending: false }),
        supabase
          .from("weekly_integrations")
          .select("*")
          .eq("user_id", user.id)
          .eq("week_number", currentWeekNumber)
          .eq("year", currentYear)
          .maybeSingle(),
        supabase
          .from("weekly_integrations")
          .select("*")
          .eq("user_id", user.id)
          .eq("week_number", prevWeekNum)
          .eq("year", prevYear)
          .maybeSingle(),
        supabase
          .from("weekly_pillar_targets")
          .select("*")
          .eq("user_id", user.id),
        supabase
          .from("identity_seeds")
          .select("content, core_values, year_note")
          .eq("user_id", user.id)
          .maybeSingle()
      ]);

      setActions(actionsResult.data || []);
      setWeeklyData(weeklyResult.data);
      setPrevWeekData(prevWeekResult.data);
      setIdentitySeed(identityResult.data);
      
      // Process pillar targets
      const targetsMap: Record<string, PillarTarget> = {};
      (targetsResult.data || []).forEach((t: any) => {
        targetsMap[t.pillar] = t;
      });
      setPillarTargets(targetsMap);
    } catch (error) {
      console.error("Error fetching week data:", error);
    } finally {
      setLoading(false);
    }
  };
  
  // Generate monthly insight based on identity and current progress
  const generateMonthlyInsight = async () => {
    if (!identitySeed) {
      toast.error("No identity seed found. Set up your 2026 Direction first.");
      return;
    }
    
    setGeneratingMonthlyInsight(true);
    try {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const weeksIntoMonth = differenceInWeeks(now, monthStart) + 1;
      const weeksLeft = differenceInWeeks(monthEnd, now);
      const daysIntoYear = differenceInDays(now, new Date(now.getFullYear(), 0, 1)) + 1;
      const daysLeftInYear = differenceInDays(new Date(now.getFullYear(), 11, 31), now);
      
      const { data, error } = await supabase.functions.invoke('synthesizer', {
        body: {
          type: 'monthly_reverse_engineer',
          context: {
            identity: identitySeed.content,
            coreValues: identitySeed.core_values,
            yearDirection: identitySeed.year_note,
            currentMonth: format(now, 'MMMM yyyy'),
            weeksIntoMonth,
            weeksLeftInMonth: weeksLeft,
            daysIntoYear,
            daysLeftInYear,
            currentWeekNumber,
            weeklyActions: weekAnalysis.totalActions,
            pillarDistribution: weekAnalysis.byPillar,
            activeDays: weekAnalysis.activeDays,
          }
        }
      });
      
      if (error) throw error;
      
      if (data?.insight) {
        setMonthlyInsight(data.insight);
      } else if (data?.content) {
        setMonthlyInsight(data.content);
      }
    } catch (error) {
      console.error("Error generating monthly insight:", error);
      toast.error("Failed to generate monthly insight");
    } finally {
      setGeneratingMonthlyInsight(false);
    }
  };

  // Initialize editing targets from current targets
  const openTargetsDialog = () => {
    const editing: Record<string, { target: number; priority: number; reasoning?: string }> = {};
    Object.keys(PILLAR_CONFIG).forEach(pillar => {
      const existing = pillarTargets[pillar];
      if (existing) {
        editing[pillar] = { target: existing.weekly_target, priority: existing.priority };
      } else {
        editing[pillar] = DEFAULT_PILLAR_TARGETS[pillar] || { target: 3, priority: 2 };
      }
    });
    setEditingTargets(editing);
    setAiSummary(null);
    setAiAlert(null);
    setShowTargetsDialog(true);
  };

  // Generate smart targets using AI based on identity
  const generateSmartTargets = async () => {
    setGeneratingTargets(true);
    setAiSummary(null);
    setAiAlert(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-pillar-targets');
      
      if (error) throw error;
      
      if (data.error) {
        if (data.message) {
          toast.error(data.message);
        } else {
          toast.error(data.error);
        }
        return;
      }
      
      if (data.targets) {
        const newTargets: Record<string, { target: number; priority: number; reasoning?: string }> = {};
        Object.entries(data.targets).forEach(([pillar, values]: [string, any]) => {
          newTargets[pillar] = {
            target: values.weekly_target || 3,
            priority: values.priority || 2,
            reasoning: values.reasoning,
          };
        });
        setEditingTargets(newTargets);
        setAiSummary(data.summary || null);
        setAiAlert(data.alert || null);
        toast.success("Smart targets generated from your identity!");
      }
    } catch (error) {
      console.error("Error generating smart targets:", error);
      toast.error("Failed to generate smart targets");
    } finally {
      setGeneratingTargets(false);
    }
  };

  // Auto-adjust targets based on completion rate
  const autoAdjustTargets = async () => {
    setAutoAdjusting(true);
    setAdjustmentStats(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('auto-adjust-targets');
      
      if (error) throw error;
      
      if (data.error) {
        toast.error(data.error);
        return;
      }
      
      // Update editing targets with new values
      if (data.adjustments?.length > 0) {
        const newTargets = { ...editingTargets };
        data.adjustments.forEach((adj: { pillar: string; newTarget: number; reason: string }) => {
          if (newTargets[adj.pillar]) {
            newTargets[adj.pillar].target = adj.newTarget;
            newTargets[adj.pillar].reasoning = adj.reason;
          }
        });
        setEditingTargets(newTargets);
        toast.success(`Adjusted ${data.adjustments.length} pillar target(s)`);
      } else {
        toast.info("Your targets are well-calibrated!");
      }
      
      setAdjustmentStats(data.pillarStats || null);
      setAiSummary(data.summary || null);
      
      // Refresh data
      fetchWeekData();
    } catch (error) {
      console.error("Error auto-adjusting targets:", error);
      toast.error("Failed to auto-adjust targets");
    } finally {
      setAutoAdjusting(false);
    }
  };

  // Save pillar targets
  const saveTargets = async () => {
    if (!user) return;
    setSavingTargets(true);
    
    try {
      // Upsert all targets
      const upserts = Object.entries(editingTargets).map(([pillar, values]) => ({
        user_id: user.id,
        pillar,
        weekly_target: values.target,
        priority: values.priority,
      }));
      
      // Delete existing and insert new (simpler than upsert with composite key)
      await supabase.from("weekly_pillar_targets").delete().eq("user_id", user.id);
      const { error } = await supabase.from("weekly_pillar_targets").insert(upserts);
      
      if (error) throw error;
      
      toast.success("Pillar targets saved!");
      setShowTargetsDialog(false);
      fetchWeekData();
    } catch (error) {
      console.error("Error saving targets:", error);
      toast.error("Failed to save targets");
    } finally {
      setSavingTargets(false);
    }
  };

  // Analyze the week's actions
  const weekAnalysis = useMemo(() => {
    const byDay: Record<string, ActionHistory[]> = {};
    const byPillar: Record<string, number> = {};
    let streak = 0;
    let maxStreak = 0;
    let currentStreak = 0;

    weekDays.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      byDay[dateStr] = actions.filter(a => a.action_date === dateStr);
      
      if (byDay[dateStr].length > 0) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else if (!isToday(day) && day < new Date()) {
        currentStreak = 0;
      }
    });

    actions.forEach(action => {
      // Normalize pillar names to match config keys
      const rawPillar = (action.pillar || 'other').toLowerCase();
      // Map common variations to standard pillars
      const pillarMap: Record<string, string> = {
        'connection': 'relationship',
        'skill': 'mind',
        'learning': 'mind',
        'presence': 'mind',
        'stability': 'business',
      };
      const pillar = pillarMap[rawPillar] || rawPillar;
      byPillar[pillar] = (byPillar[pillar] || 0) + 1;
    });

    // Find dominant and neglected pillars
    const pillars = Object.entries(byPillar).sort((a, b) => b[1] - a[1]);
    const dominantPillar = pillars[0]?.[0];
    const activePillars = pillars.filter(([_, count]) => count > 0).length;
    
    // Days with at least one action
    const activeDays = Object.values(byDay).filter(d => d.length > 0).length;
    const completionRate = Math.round((activeDays / 7) * 100);

    return {
      byDay,
      byPillar,
      dominantPillar,
      activePillars,
      activeDays,
      completionRate,
      totalActions: actions.length,
      maxStreak
    };
  }, [actions, weekDays]);


  // Analyze today's actions (for day-by-day view)
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayAnalysis = useMemo(() => {
    const todayActions = actions.filter(a => a.action_date === todayStr);
    const byPillar: Record<string, number> = {};

    todayActions.forEach(action => {
      // Normalize pillar names to match config keys
      const rawPillar = (action.pillar || 'other').toLowerCase();
      const pillarMap: Record<string, string> = {
        'connection': 'relationship',
        'skill': 'mind',
        'learning': 'mind',
        'presence': 'mind',
        'stability': 'business',
      };
      const pillar = pillarMap[rawPillar] || rawPillar;
      byPillar[pillar] = (byPillar[pillar] || 0) + 1;
    });

    const pillars = Object.entries(byPillar).sort((a, b) => b[1] - a[1]);
    const dominantPillar = pillars[0]?.[0];
    const activePillars = pillars.filter(([_, count]) => count > 0).length;

    return {
      byPillar,
      dominantPillar,
      activePillars,
      totalActions: todayActions.length,
    };
  }, [actions, todayStr]);

  const effectivePillarScope: 'day' | 'week' = isCurrentWeek ? pillarScope : 'week';
  const pillarAnalysis = effectivePillarScope === 'day'
    ? ({ byPillar: todayAnalysis.byPillar, dominantPillar: todayAnalysis.dominantPillar, activePillars: todayAnalysis.activePillars, totalActions: todayAnalysis.totalActions } as const)
    : ({ byPillar: weekAnalysis.byPillar, dominantPillar: weekAnalysis.dominantPillar, activePillars: weekAnalysis.activePillars, totalActions: weekAnalysis.totalActions } as const);

  // Compare with previous week
  const weekComparison = useMemo(() => {
    if (!weeklyData || !prevWeekData) return null;

    const pillars = ['business', 'body', 'content', 'relationship', 'mind', 'play'];
    const changes: Record<string, { current: number; previous: number; trend: 'up' | 'down' | 'same' }> = {};

    pillars.forEach(pillar => {
      const currentScore = (weeklyData as any)[`${pillar}_score`] || 0;
      const prevScore = (prevWeekData as any)[`${pillar}_score`] || 0;
      changes[pillar] = {
        current: currentScore,
        previous: prevScore,
        trend: currentScore > prevScore ? 'up' : currentScore < prevScore ? 'down' : 'same'
      };
    });

    return changes;
  }, [weeklyData, prevWeekData]);

  const navigateWeek = (direction: 'prev' | 'next') => {
    setViewDate(current => direction === 'prev' ? subWeeks(current, 1) : addWeeks(current, 1));
  };

  return (
    <div className="space-y-6">
      {/* Week Navigator */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => navigateWeek('prev')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <h2 className="font-semibold text-lg">
            {isCurrentWeek ? "This Week" : `Week ${currentWeekNumber}`}
          </h2>
          <p className="text-sm text-muted-foreground">
            {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
          </p>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigateWeek('next')}
          disabled={isCurrentWeek}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Quick Log Input */}
      {isCurrentWeek && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <Plus className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Log what you did</span>
              {isRecording && (
                <Badge variant="destructive" className="text-[10px] ml-auto animate-pulse">
                  <Mic className="h-2.5 w-2.5 mr-1" />
                  {formattedDuration}
                </Badge>
              )}
            </div>
            
            {/* Parsed items preview */}
            {showParsedPreview && parsedItems.length > 0 && (
              <div className="mb-3 p-3 rounded-lg bg-background border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Parsed from voice ({parsedItems.length} items)
                  </span>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-6 text-xs"
                    onClick={() => {
                      setParsedItems([]);
                      setShowParsedPreview(false);
                    }}
                  >
                    Clear
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {parsedItems.map((item, index) => {
                    const pillarConfig = item.pillar ? PILLAR_CONFIG[item.pillar] : null;
                    const Icon = pillarConfig?.icon;
                    return (
                      <div 
                        key={index} 
                        className="flex items-center gap-2 p-2 rounded bg-muted/50 group"
                      >
                        {Icon && <Icon className={`h-3.5 w-3.5 ${pillarConfig?.color}`} />}
                        <span className="text-sm flex-1">{item.text}</span>
                        <button
                          onClick={() => removeParsedItem(index)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
                <Button 
                  size="sm" 
                  className="w-full mt-2"
                  onClick={handleLogParsedItems}
                  disabled={isLogging}
                >
                  {isLogging ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Log all {parsedItems.length} items
                </Button>
              </div>
            )}
            
            {/* Parsing indicator */}
            {isParsing && (
              <div className="mb-3 p-3 rounded-lg bg-background border flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Parsing your voice log...</span>
              </div>
            )}
            
            {!showParsedPreview && (
              <>
                {/* Show interim transcript while recording */}
                {isRecording && interimTranscript && (
                  <div className="mb-2 p-2 rounded-lg bg-muted/50 border border-primary/20">
                    <p className="text-sm text-muted-foreground italic">{interimTranscript}</p>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Input
                    placeholder={isRecording ? "Listening... speak naturally about your day" : "e.g. 30 min workout, wrote blog post..."}
                    value={logInput}
                    onChange={(e) => setLogInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !isLogging && logInput.trim() && handleQuickLog()}
                    className="flex-1"
                    disabled={isRecording || isParsing}
                  />
                  <Button 
                    size="icon" 
                    variant={isRecording ? "destructive" : "outline"}
                    onClick={toggleRecording}
                    disabled={isTranscribing || isParsing || !voiceSupported}
                    title={!voiceSupported ? "Voice not supported in this browser" : isRecording ? `Stop recording (${formattedDuration})` : "Voice input - speak naturally (up to 2 min)"}
                  >
                    {isTranscribing || isParsing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isRecording ? (
                      <MicOff className="h-4 w-4" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </Button>
                  <Button 
                    size="icon" 
                    onClick={handleQuickLog} 
                    disabled={isLogging || !logInput.trim() || isRecording || isParsing}
                  >
                    {isLogging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                {/* Pillar quick-select */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {Object.entries(PILLAR_CONFIG).map(([key, config]) => {
                    const Icon = config.icon;
                    const isSelected = selectedPillar === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedPillar(isSelected ? null : key)}
                        className={`
                          flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all
                          ${isSelected 
                            ? `${config.bgColor} text-white` 
                            : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground'
                          }
                        `}
                      >
                        <Icon className="h-3 w-3" />
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Week at a Glance - The Weave */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-r from-primary/10 to-transparent">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Week's Weave
              </CardTitle>
              <CardDescription>
                {weekAnalysis.totalActions} actions across {weekAnalysis.activePillars} pillars
              </CardDescription>
            </div>
            {weekAnalysis.maxStreak >= 3 && (
              <Badge className="bg-orange-500/20 text-orange-600 border-0">
                <Flame className="h-3 w-3 mr-1" />
                {weekAnalysis.maxStreak} day streak
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {/* Daily Activity Grid */}
          <div className="grid grid-cols-7 gap-1 mb-4">
            {weekDays.map((day, i) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayActions = weekAnalysis.byDay[dateStr] || [];
              const hasActions = dayActions.length > 0;
              const isPast = day < new Date() && !isToday(day);
              const isTodayDate = isToday(day);
              
              // Get unique pillars for this day
              const dayPillars = [...new Set(dayActions.map(a => a.pillar).filter(Boolean))];
              
              return (
                <div key={i} className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">{DAYS[i]}</div>
                  <div 
                    className={`
                      relative h-12 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all
                      ${isTodayDate ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
                      ${hasActions ? 'bg-primary/15' : isPast ? 'bg-muted/30' : 'bg-muted/10 border border-dashed border-muted-foreground/20'}
                    `}
                  >
                    {hasActions ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-medium">{dayActions.length}</span>
                      </>
                    ) : isPast ? (
                      <Circle className="h-4 w-4 text-muted-foreground/30" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/20" />
                    )}
                    
                    {/* Pillar dots */}
                    {dayPillars.length > 0 && (
                      <div className="absolute -bottom-1 flex gap-0.5">
                        {dayPillars.slice(0, 3).map((pillar, pi) => (
                          <div 
                            key={pi}
                            className={`w-1.5 h-1.5 rounded-full ${PILLAR_CONFIG[pillar as string]?.bgColor || 'bg-muted-foreground'}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Weekly Completion + Goal Connection */}
          <div className="flex flex-col sm:flex-row items-stretch gap-3 p-3 rounded-lg bg-muted/30">
            <div className="flex-1">
              <div className="flex justify-between text-xs sm:text-sm mb-1">
                <span className="text-muted-foreground">Week completion</span>
                <span className="font-medium">{weekAnalysis.activeDays}/7 days</span>
              </div>
              <Progress value={weekAnalysis.completionRate} className="h-1.5 sm:h-2" />
            </div>
            <div className="flex items-center justify-center gap-3 sm:gap-0 sm:flex-col sm:border-l sm:pl-3">
              <div className="text-xl sm:text-2xl font-bold text-primary">
                {weekAnalysis.completionRate}%
              </div>
              <div className="text-[10px] text-muted-foreground text-center hidden sm:block">
                of 2026
              </div>
            </div>
          </div>
          
          {/* Goal Connection - Visual Flow */}
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground px-2 py-1.5 bg-muted/20 rounded">
            <span className="px-1.5 py-0.5 bg-background rounded text-foreground/80">Daily Log</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
            <span className="px-1.5 py-0.5 bg-primary/10 rounded text-primary font-medium">This Week</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
            <span className="px-1.5 py-0.5 bg-background rounded text-foreground/80">Monthly</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
            <span className="px-1.5 py-0.5 bg-orange-500/10 rounded text-orange-600 dark:text-orange-400">2026 Compass</span>
          </div>
        </CardContent>
      </Card>

      {/* Pillar Balance */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Pillar Balance
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={openTargetsDialog}
                  title="Set weekly targets"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </CardTitle>
              <CardDescription>
                {effectivePillarScope === 'day' ? 'Where your energy went today' : 'Progress toward weekly targets'}
              </CardDescription>
            </div>

            {isCurrentWeek && (
              <div className="flex items-center gap-1 rounded-md bg-muted/50 p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={effectivePillarScope === 'day' ? 'secondary' : 'ghost'}
                  className="h-7 px-2 text-xs"
                  onClick={() => setPillarScope('day')}
                >
                  Today
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={effectivePillarScope === 'week' ? 'secondary' : 'ghost'}
                  className="h-7 px-2 text-xs"
                  onClick={() => setPillarScope('week')}
                >
                  Week
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(PILLAR_CONFIG).map(([key, config]) => {
              const count = pillarAnalysis.byPillar[key] || 0;
              const target = pillarTargets[key]?.weekly_target || DEFAULT_PILLAR_TARGETS[key]?.target || 3;
              const targetProgress = effectivePillarScope === 'week' ? Math.min(Math.round((count / target) * 100), 100) : null;
              const Icon = config.icon;
              const comparison = effectivePillarScope === 'week' ? weekComparison?.[key] : null;
              const isOnTrack = count >= target;
              const priority = pillarTargets[key]?.priority || DEFAULT_PILLAR_TARGETS[key]?.priority || 2;

              return (
                <div key={key} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center relative flex-shrink-0 ${count > 0 ? config.bgColor + '/20' : 'bg-muted'}`}>
                    <Icon className={`h-4 w-4 ${count > 0 ? config.color : 'text-muted-foreground'}`} />
                    {effectivePillarScope === 'week' && priority >= 4 && (
                      <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-orange-500" title="High priority" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{config.label}</span>
                      <div className="flex items-center gap-2">
                        {effectivePillarScope === 'week' ? (
                          <span className={`text-xs ${isOnTrack ? 'text-green-500 font-medium' : 'text-muted-foreground'}`}>
                            {count}/{target}
                            {isOnTrack && <CheckCircle2 className="inline h-3 w-3 ml-0.5" />}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{count}</span>
                        )}
                        {comparison && (
                          <span className={`flex items-center text-xs ${
                            comparison.trend === 'up' ? 'text-green-500' :
                            comparison.trend === 'down' ? 'text-red-500' : 'text-muted-foreground'
                          }`}>
                            {comparison.trend === 'up' && <TrendingUp className="h-3 w-3" />}
                            {comparison.trend === 'down' && <TrendingDown className="h-3 w-3" />}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          effectivePillarScope === 'week' && isOnTrack 
                            ? 'bg-green-500' 
                            : count > 0 ? config.bgColor : 'bg-muted'
                        }`}
                        style={{ width: effectivePillarScope === 'week' ? `${targetProgress}%` : (count > 0 ? `${Math.round((count / Math.max(...Object.values(pillarAnalysis.byPillar), 1)) * 100)}%` : '0%') }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {pillarAnalysis.totalActions === 0 && (
            <div className="mt-4 p-3 rounded-lg bg-muted/30 text-center">
              <p className="text-sm text-muted-foreground">
                {effectivePillarScope === 'day' ? "No actions logged today yet." : "No actions logged this week yet."}
              </p>
            </div>
          )}

          {/* Show weekly context when viewing today */}
          {effectivePillarScope === 'day' && weekAnalysis.totalActions > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-muted/30">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Week progress: {weekAnalysis.activeDays}/7 days active</span>
                <span>{weekAnalysis.activePillars}/6 pillars touched</span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden mt-2">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                  style={{ width: `${weekAnalysis.completionRate}%` }}
                />
              </div>
            </div>
          )}

          {pillarAnalysis.dominantPillar && pillarAnalysis.activePillars < 4 && pillarAnalysis.totalActions > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                <span className="font-medium">Notice:</span>{' '}
                {pillarAnalysis.activePillars === 1
                  ? `All energy in ${PILLAR_CONFIG[pillarAnalysis.dominantPillar]?.label}. Consider spreading focus.`
                  : `${6 - pillarAnalysis.activePillars} pillars untouched. Balance creates resilience.`
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's Actions List */}
      {(() => {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const todayActions = actions.filter(a => a.action_date === todayStr);
        
        if (todayActions.length === 0 && isCurrentWeek) {
          return (
            <Card className="border-dashed">
              <CardContent className="pt-6 pb-6 text-center">
                <Circle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Nothing logged today yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Use voice or type above to log what you did</p>
              </CardContent>
            </Card>
          );
        }
        
        if (todayActions.length === 0) return null;
        
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                What You Did Today
                <Badge variant="secondary" className="text-xs font-normal">
                  {todayActions.length} {todayActions.length === 1 ? 'action' : 'actions'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {todayActions.map((action) => {
                  const pillarConfig = action.pillar ? PILLAR_CONFIG[action.pillar] : null;
                  const Icon = pillarConfig?.icon || CheckCircle2;
                  
                  return (
                    <div key={action.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                      <Icon className={`h-4 w-4 mt-0.5 ${pillarConfig?.color || 'text-muted-foreground'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{action.action_text}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(action.completed_at), 'h:mm a')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Monthly Misogi Reverse-Engineering */}
      {isCurrentWeek && identitySeed?.year_note && (
        <Card className="border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-amber-500/5">
          <Collapsible open={monthlyInsightsExpanded} onOpenChange={setMonthlyInsightsExpanded}>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center">
                      <Mountain className="h-5 w-5 text-orange-500" />
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        2026 Compass
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {format(new Date(), 'MMMM')} · Week {currentWeekNumber} · {differenceInDays(new Date(2026, 11, 31), new Date())} days left
                      </CardDescription>
                    </div>
                  </div>
                  {monthlyInsightsExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                {/* Misogi (Outcome) */}
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <div className="flex items-start gap-2">
                    <Mountain className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">The Misogi (Outcomes)</p>
                      <p className="text-sm text-muted-foreground line-clamp-3">{identitySeed.year_note}</p>
                    </div>
                  </div>
                </div>
                
                {/* Identity (Who you're becoming) - only show if different from year_note */}
                {identitySeed.content && identitySeed.content !== identitySeed.year_note && (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-start gap-2">
                      <Compass className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-primary mb-1">Who You're Becoming</p>
                        <p className="text-sm text-muted-foreground line-clamp-3">{identitySeed.content}</p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Progress Indicators - Activity-based */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-2 rounded-lg bg-muted/20">
                    <p className="text-lg font-bold text-foreground">{currentWeekNumber}</p>
                    <p className="text-[10px] text-muted-foreground">Week</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/20">
                    <p className="text-lg font-bold text-foreground">{weekAnalysis.totalActions}</p>
                    <p className="text-[10px] text-muted-foreground">This Week</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/20">
                    {/* Calculate momentum score based on pillar balance + streak + completion */}
                    {(() => {
                      const pillarsActive = weekAnalysis.activePillars || 0;
                      const daysActive = weekAnalysis.activeDays || 0;
                      const totalActions = weekAnalysis.totalActions || 0;
                      // Momentum: balance of pillars (0-6) + active days (0-7) + volume bonus
                      const momentumScore = Math.min(100, Math.round(
                        (pillarsActive / 6 * 30) + // pillar balance: 30%
                        (daysActive / 7 * 40) + // consistency: 40%
                        (Math.min(totalActions, 15) / 15 * 30) // volume: 30%
                      ));
                      return (
                        <>
                          <p className={`text-lg font-bold ${momentumScore >= 70 ? 'text-green-500' : momentumScore >= 40 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                            {momentumScore}%
                          </p>
                          <p className="text-[10px] text-muted-foreground">Momentum</p>
                        </>
                      );
                    })()}
                  </div>
                </div>
                
                {/* AI Monthly Insight */}
                {monthlyInsight ? (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-sm text-foreground whitespace-pre-line">{monthlyInsight}</p>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="mt-2 h-7 text-xs"
                      onClick={generateMonthlyInsight}
                      disabled={generatingMonthlyInsight}
                    >
                      {generatingMonthlyInsight ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Wand2 className="h-3 w-3 mr-1" />
                      )}
                      Refresh insight
                    </Button>
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    className="w-full border-dashed border-orange-500/30 hover:border-orange-500/50"
                    onClick={generateMonthlyInsight}
                    disabled={generatingMonthlyInsight}
                  >
                    {generatingMonthlyInsight ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Reverse-engineering from your Misogi...
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4 mr-2" />
                        What should I focus on this month?
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {/* Check-in CTA */}
      {isCurrentWeek && (
        <Button onClick={onCheckin} className="w-full" size="lg">
          <Calendar className="h-4 w-4 mr-2" />
          Log This Week's Metrics
        </Button>
      )}

      {/* Pillar Targets Dialog */}
      <Dialog open={showTargetsDialog} onOpenChange={setShowTargetsDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Weekly Pillar Targets
            </DialogTitle>
            <DialogDescription>
              Set your minimum weekly actions for each pillar. Use AI to generate targets from your identity.
            </DialogDescription>
          </DialogHeader>
          
          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="flex-1 border-dashed"
              onClick={generateSmartTargets}
              disabled={generatingTargets || autoAdjusting}
            >
              {generatingTargets ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="hidden sm:inline">Analyzing...</span>
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">From Identity</span>
                  <span className="sm:hidden">Identity</span>
                </>
              )}
            </Button>
            <Button 
              variant="outline" 
              className="flex-1 border-dashed"
              onClick={autoAdjustTargets}
              disabled={autoAdjusting || generatingTargets}
            >
              {autoAdjusting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="hidden sm:inline">Adjusting...</span>
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Auto-Adjust</span>
                  <span className="sm:hidden">Adjust</span>
                </>
              )}
            </Button>
          </div>
          
          {/* Completion Stats */}
          {adjustmentStats && adjustmentStats.length > 0 && (
            <div className="p-3 rounded-lg bg-muted/50 border border-border/50 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Completion Rates (2 weeks)</p>
              <div className="grid grid-cols-2 gap-2">
                {adjustmentStats.map(stat => {
                  const config = PILLAR_CONFIG[stat.pillar];
                  if (!config) return null;
                  return (
                    <div key={stat.pillar} className="flex items-center gap-2 text-sm">
                      <div className={`w-2 h-2 rounded-full ${config.bgColor}`} />
                      <span className="flex-1 truncate">{config.label}</span>
                      <span className={`font-medium ${stat.completionRate >= 80 ? 'text-green-500' : stat.completionRate >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                        {stat.completionRate}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* AI Summary */}
          {aiSummary && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-sm text-foreground">{aiSummary}</p>
            </div>
          )}
          
          {/* AI Alert */}
          {aiAlert && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-400">{aiAlert}</p>
            </div>
          )}
          
          <div className="space-y-3 py-2">
            {Object.entries(PILLAR_CONFIG).map(([key, config]) => {
              const Icon = config.icon;
              const values = editingTargets[key] || { target: 3, priority: 2 };
              
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.bgColor}/20`}>
                      <Icon className={`h-4 w-4 ${config.color}`} />
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-medium">{config.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-muted-foreground mb-0.5">Target</span>
                        <Input
                          type="number"
                          min={0}
                          max={20}
                          value={values.target}
                          onChange={(e) => setEditingTargets(prev => ({
                            ...prev,
                            [key]: { ...prev[key], target: parseInt(e.target.value) || 0 }
                          }))}
                          className="w-14 h-8 text-center text-sm"
                        />
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-muted-foreground mb-0.5">Priority</span>
                        <select
                          value={values.priority}
                          onChange={(e) => setEditingTargets(prev => ({
                            ...prev,
                            [key]: { ...prev[key], priority: parseInt(e.target.value) }
                          }))}
                          className="w-14 h-8 text-sm rounded-md border bg-background px-1"
                        >
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                          <option value={4}>4</option>
                          <option value={5}>5</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  {/* Show AI reasoning if available */}
                  {values.reasoning && (
                    <p className="text-xs text-muted-foreground pl-11 italic">{values.reasoning}</p>
                  )}
                </div>
              );
            })}
          </div>
          
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowTargetsDialog(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={saveTargets} disabled={savingTargets}>
              {savingTargets ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Save Targets
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
