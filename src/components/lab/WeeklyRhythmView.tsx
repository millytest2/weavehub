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
  MicOff
} from "lucide-react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, addWeeks, subWeeks, getWeek, getYear } from "date-fns";
import { toast } from "sonner";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";

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

const PILLAR_CONFIG: Record<string, { label: string; icon: any; color: string; bgColor: string }> = {
  business: { label: 'Business', icon: Briefcase, color: 'text-blue-500', bgColor: 'bg-blue-500' },
  body: { label: 'Body', icon: Activity, color: 'text-green-500', bgColor: 'bg-green-500' },
  content: { label: 'Content', icon: FileText, color: 'text-purple-500', bgColor: 'bg-purple-500' },
  relationship: { label: 'Relationship', icon: Heart, color: 'text-pink-500', bgColor: 'bg-pink-500' },
  mind: { label: 'Mind', icon: Brain, color: 'text-orange-500', bgColor: 'bg-orange-500' },
  play: { label: 'Play', icon: Gamepad2, color: 'text-cyan-500', bgColor: 'bg-cyan-500' },
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
  
  // Quick log state
  const [logInput, setLogInput] = useState("");
  const [selectedPillar, setSelectedPillar] = useState<string | null>(null);
  const [isLogging, setIsLogging] = useState(false);
  
  // Voice capture for quick log
  const { isRecording, isTranscribing, isSupported: voiceSupported, toggleRecording } = useVoiceCapture({
    onTranscript: (text) => {
      setLogInput(prev => prev ? `${prev} ${text}` : text);
    }
  });

  const weekStart = startOfWeek(viewDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(viewDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const currentWeekNumber = getWeek(viewDate, { weekStartsOn: 1 });
  const currentYear = getYear(viewDate);
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }));

  const handleQuickLog = async () => {
    if (!user || !logInput.trim()) return;
    
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

  const fetchWeekData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const startDate = format(weekStart, 'yyyy-MM-dd');
      const endDate = format(weekEnd, 'yyyy-MM-dd');
      const prevWeekNum = currentWeekNumber === 1 ? 52 : currentWeekNumber - 1;
      const prevYear = currentWeekNumber === 1 ? currentYear - 1 : currentYear;

      const [actionsResult, weeklyResult, prevWeekResult] = await Promise.all([
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
          .maybeSingle()
      ]);

      setActions(actionsResult.data || []);
      setWeeklyData(weeklyResult.data);
      setPrevWeekData(prevWeekResult.data);
    } catch (error) {
      console.error("Error fetching week data:", error);
    } finally {
      setLoading(false);
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
      const pillar = action.pillar || 'other';
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
            </div>
            <div className="flex gap-2">
              <Input
                placeholder={isRecording ? "Listening..." : "e.g. 30 min workout, wrote blog post..."}
                value={logInput}
                onChange={(e) => setLogInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isLogging && logInput.trim() && handleQuickLog()}
                className="flex-1"
                disabled={isRecording}
              />
              {voiceSupported && (
                <Button 
                  size="icon" 
                  variant={isRecording ? "destructive" : "outline"}
                  onClick={toggleRecording}
                  disabled={isTranscribing}
                  title={isRecording ? "Stop recording" : "Voice input"}
                >
                  {isTranscribing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isRecording ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
              )}
              <Button 
                size="icon" 
                onClick={handleQuickLog} 
                disabled={isLogging || !logInput.trim() || isRecording}
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

          {/* Weekly Completion */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
            <div className="flex-1">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Week completion</span>
                <span className="font-medium">{weekAnalysis.activeDays}/7 days active</span>
              </div>
              <Progress value={weekAnalysis.completionRate} className="h-2" />
            </div>
            <div className="text-2xl font-bold text-primary">
              {weekAnalysis.completionRate}%
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pillar Balance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pillar Balance</CardTitle>
          <CardDescription>Where your energy went this week</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(PILLAR_CONFIG).map(([key, config]) => {
              const count = weekAnalysis.byPillar[key] || 0;
              const maxCount = Math.max(...Object.values(weekAnalysis.byPillar), 1);
              const percentage = Math.round((count / maxCount) * 100);
              const Icon = config.icon;
              const comparison = weekComparison?.[key];
              
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${count > 0 ? config.bgColor + '/20' : 'bg-muted'}`}>
                    <Icon className={`h-4 w-4 ${count > 0 ? config.color : 'text-muted-foreground'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{config.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{count} actions</span>
                        {comparison && (
                          <span className={`flex items-center text-xs ${
                            comparison.trend === 'up' ? 'text-green-500' : 
                            comparison.trend === 'down' ? 'text-red-500' : 'text-muted-foreground'
                          }`}>
                            {comparison.trend === 'up' && <TrendingUp className="h-3 w-3" />}
                            {comparison.trend === 'down' && <TrendingDown className="h-3 w-3" />}
                            {comparison.trend === 'same' && <Minus className="h-3 w-3" />}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${count > 0 ? config.bgColor : 'bg-muted'}`}
                        style={{ width: count > 0 ? `${percentage}%` : '0%' }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Insight */}
          {weekAnalysis.dominantPillar && weekAnalysis.activePillars < 4 && (
            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                <span className="font-medium">Notice:</span> {weekAnalysis.activePillars === 1 
                  ? `All energy in ${PILLAR_CONFIG[weekAnalysis.dominantPillar]?.label}. Consider spreading focus.`
                  : `${6 - weekAnalysis.activePillars} pillars untouched. Balance creates resilience.`
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Week's Actions List */}
      {actions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">What You Did</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {actions.slice(0, 10).map((action) => {
                const pillarConfig = action.pillar ? PILLAR_CONFIG[action.pillar] : null;
                const Icon = pillarConfig?.icon || CheckCircle2;
                
                return (
                  <div key={action.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                    <Icon className={`h-4 w-4 mt-0.5 ${pillarConfig?.color || 'text-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{action.action_text}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(action.action_date), 'EEE, MMM d')}
                      </p>
                    </div>
                  </div>
                );
              })}
              {actions.length > 10 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  +{actions.length - 10} more actions
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Check-in CTA */}
      {isCurrentWeek && (
        <Button onClick={onCheckin} className="w-full" size="lg">
          <Calendar className="h-4 w-4 mr-2" />
          Log This Week's Metrics
        </Button>
      )}
    </div>
  );
}
