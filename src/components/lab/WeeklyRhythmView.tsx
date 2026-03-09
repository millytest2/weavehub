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
} from "lucide-react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, addWeeks, subWeeks, getWeek, getYear } from "date-fns";
import { toast } from "sonner";
import { useVoiceCaptureWebSpeech } from "@/hooks/useVoiceCaptureWebSpeech";

interface ActionHistory {
  id: string;
  action_text: string;
  action_date: string;
  pillar: string | null;
  completed_at: string;
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
  
  // Quick log state
  const [logInput, setLogInput] = useState("");
  const [selectedPillar, setSelectedPillar] = useState<string | null>(null);
  const [isLogging, setIsLogging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedItems, setParsedItems] = useState<{ text: string; pillar: string | null }[]>([]);
  const [showParsedPreview, setShowParsedPreview] = useState(false);
  
   
  
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

  // Auto-adjust targets - runs on every visit to check for needed adjustments
  // More responsive: checks after any action logging, not just Sun/Mon
  useEffect(() => {
    if (!user || !isCurrentWeek) return;
    
    const checkAutoAdjust = async () => {
      // Only run once per hour max to avoid spam
      const lastCheckKey = `lastAutoAdjustCheck_${user.id}`;
      const lastCheck = localStorage.getItem(lastCheckKey);
      const now = Date.now();
      
      if (lastCheck && (now - parseInt(lastCheck)) < 60 * 60 * 1000) {
        return; // Less than 1 hour since last check
      }
      
      console.log("Running auto-adjust check...");
      try {
        const { data, error } = await supabase.functions.invoke('auto-adjust-targets');
        if (error) throw error;
        
        if (data.adjustments?.length > 0) {
          toast.success(`${data.summary}`, { duration: 4000 });
          fetchWeekData(); // Refresh to show new targets
        }
        
        localStorage.setItem(lastCheckKey, now.toString());
      } catch (error) {
        console.error("Auto-adjust check failed:", error);
      }
    };
    
    // Run after data loads
    const timer = setTimeout(checkAutoAdjust, 1500);
    return () => clearTimeout(timer);
  }, [user, isCurrentWeek, actions.length]); // Re-run when actions change

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
          .maybeSingle(),
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

      {/* Today's Actions List */}
      {isCurrentWeek && (() => {
        const todayActions = actions.filter(a => a.action_date === format(new Date(), 'yyyy-MM-dd'));
        
        if (todayActions.length === 0) {
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
        
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                Today
                <Badge variant="secondary" className="text-xs font-normal">
                  {todayActions.length} {todayActions.length === 1 ? 'action' : 'actions'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-48 overflow-y-auto">
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
          
        </CardContent>
      </Card>




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
