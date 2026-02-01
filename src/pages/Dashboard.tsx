import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowRight, Check, Zap, RefreshCw, Clock, Battery, BatteryLow, BatteryMedium, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

import { DayCompleteRecommendations } from "@/components/dashboard/DayCompleteRecommendations";
import { MorningRitualPrompt } from "@/components/dashboard/MorningRitualPrompt";
import { EveningLetGo } from "@/components/dashboard/EveningLetGo";
import { FirstTimeTooltip } from "@/components/dashboard/FirstTimeTooltip";
import { WhatsEmerging } from "@/components/dashboard/WhatsEmerging";
import { WeaveLoader } from "@/components/ui/weave-loader";

const Dashboard = () => {
  const { user } = useAuth();
  const [todayTask, setTodayTask] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentSequence, setCurrentSequence] = useState(1);
  const [tasksForToday, setTasksForToday] = useState<any[]>([]);
  
  // Next Best Rep state
  const [isGettingRep, setIsGettingRep] = useState(false);
  const [nextRep, setNextRep] = useState<any>(null);
  const [showRepDialog, setShowRepDialog] = useState(false);
  
  // Active experiment state
  const [activeExperiment, setActiveExperiment] = useState<any>(null);
  
  // Identity state for personalized welcome
  const [identitySeed, setIdentitySeed] = useState<string | null>(null);
  const [yearNote, setYearNote] = useState<string | null>(null);
  const [isFirstTime, setIsFirstTime] = useState(false);
  
  const [morningComplete, setMorningComplete] = useState(false);
  const [eveningComplete, setEveningComplete] = useState(false);
  
  // Context chips for better suggestions
  const [showContextChips, setShowContextChips] = useState(false);
  const [selectedEnergy, setSelectedEnergy] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isSkipping, setIsSkipping] = useState(false);

  const getLocalToday = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const isTaskStale = (task: any) => {
    if (!task?.created_at) return false;
    const taskCreated = new Date(task.created_at);
    const now = new Date();
    const hoursSinceCreation = (now.getTime() - taskCreated.getTime()) / (1000 * 60 * 60);
    
    const taskHour = taskCreated.getHours();
    const currentHour = now.getHours();
    
    const getTimeOfDay = (hour: number) => {
      if (hour >= 5 && hour < 12) return 'morning';
      if (hour >= 12 && hour < 17) return 'afternoon';
      if (hour >= 17 && hour < 21) return 'evening';
      return 'night';
    };
    
    const taskTimeOfDay = getTimeOfDay(taskHour);
    const currentTimeOfDay = getTimeOfDay(currentHour);
    
    return taskTimeOfDay !== currentTimeOfDay && hoursSinceCreation > 4 && !task.completed;
  };

  const fetchData = useCallback(async () => {
    if (!user) return;

    const today = getLocalToday();

    // Fetch identity for personalized welcome
    const { data: identityRes } = await supabase
      .from("identity_seeds")
      .select("content, year_note")
      .eq("user_id", user.id)
      .maybeSingle();
    
    if (identityRes?.content) {
      setIdentitySeed(identityRes.content);
    }
    if (identityRes?.year_note) {
      setYearNote(identityRes.year_note);
    }

    const { data: tasksRes } = await supabase
      .from("daily_tasks")
      .select("*")
      .eq("user_id", user.id)
      .eq("task_date", today)
      .order("task_sequence", { ascending: true });

    if (tasksRes && tasksRes.length > 0) {
      const incomplete = tasksRes.find((t) => !t.completed);

      if (incomplete && isTaskStale(incomplete)) {
        await supabase.from("daily_tasks").delete().eq("id", incomplete.id);

        const remainingTasks = tasksRes.filter((t) => t.id !== incomplete.id);
        setTasksForToday(remainingTasks);
        setTodayTask(null);
        setCurrentSequence(remainingTasks.length + 1);
        return;
      }

      setTasksForToday(tasksRes);
      setCurrentSequence(incomplete?.task_sequence || tasksRes.length);
      setTodayTask(incomplete || tasksRes[tasksRes.length - 1]);
      setIsFirstTime(false);
    } else {
      setTasksForToday([]);
      setTodayTask(null);
      setCurrentSequence(1);
      // Check if this is their first time (no tasks ever)
      const { count } = await supabase
        .from("daily_tasks")
        .select("id", { count: 'exact', head: true })
        .eq("user_id", user.id);
      setIsFirstTime(count === 0);
    }

    const { data: expRes } = await supabase
      .from("experiments")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "in_progress")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setActiveExperiment(expRes);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    fetchData();

    const midnightCheck = setInterval(() => {
      const today = getLocalToday();
      if (tasksForToday.length > 0 && tasksForToday[0]?.task_date !== today) {
        setTasksForToday([]);
        setTodayTask(null);
        setCurrentSequence(1);
      }
    }, 60000);

    const channelName = `dashboard-tasks-${user.id}`;
    const taskChannel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_tasks", filter: `user_id=eq.${user.id}` },
        () => fetchData(),
      )
      .subscribe();

    return () => {
      clearInterval(midnightCheck);
      supabase.removeChannel(taskChannel);
    };
  }, [user, fetchData]);

  const handleGenerateTask = async (contextOverride?: { energy?: string; time?: string }) => {
    if (!user || isGenerating) return;
    
    setIsGenerating(true);
    setShowContextChips(false);
    const today = getLocalToday();
    
    try {
      const { data: existingTasks } = await supabase
        .from("daily_tasks")
        .select("id, task_sequence")
        .eq("user_id", user.id)
        .eq("task_date", today)
        .order("task_sequence", { ascending: false });
      
      if (existingTasks && existingTasks.length >= 4) {
        toast.info("All invitations done for today");
        return;
      }
      
      const maxSeq = existingTasks?.[0]?.task_sequence || 0;
      const nextSequence = maxSeq + 1;
      
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      const energyContext = contextOverride?.energy || selectedEnergy;
      const timeContext = contextOverride?.time || selectedTime;
      let contextString = '';
      if (energyContext) contextString += `Energy: ${energyContext}. `;
      if (timeContext) contextString += `Available time: ${timeContext}. `;
      
      const { data, error } = await supabase.functions.invoke("navigator", {
        body: { 
          timezone,
          context: contextString || undefined
        }
      });
      if (error) throw error;
      
      if (data) {
        const { error: insertError } = await supabase
          .from("daily_tasks")
          .insert({
            user_id: user.id,
            task_date: today,
            task_sequence: nextSequence,
            title: data.priority_for_today || "Action",
            one_thing: data.do_this_now,
            why_matters: data.why_it_matters,
            description: data.time_required,
            pillar: data.priority_for_today,
            completed: false,
          });

        if (insertError) {
          if (insertError.code === "23505") {
            await fetchData();
            return;
          }
          throw insertError;
        }

        await fetchData();
      }
    } catch (error: any) {
      console.error("Generate error:", error);
      toast.error(error.message || "Failed to generate");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCompleteTask = async () => {
    if (!todayTask || !user) return;
    
    try {
      const today = getLocalToday();
      
      const { error: updateError } = await supabase
        .from("daily_tasks")
        .update({ completed: true })
        .eq("user_id", user.id)
        .eq("task_date", today)
        .eq("task_sequence", currentSequence);

      if (updateError) throw updateError;

      const updatedTasks = tasksForToday.map(t => 
        t.task_sequence === currentSequence ? { ...t, completed: true } : t
      );
      setTasksForToday(updatedTasks);
      
      const now = new Date();
      await supabase.from('user_activity_patterns').insert({
        user_id: user.id,
        hour_of_day: now.getHours(),
        day_of_week: now.getDay(),
        activity_type: 'complete',
        pillar: todayTask?.priority_for_today
      });

      const completedNow = updatedTasks.filter(t => t.completed).length;
      
      if (completedNow < 3) {
        toast.success("Done. Generating next...");
        setTodayTask(null);
        setCurrentSequence(completedNow + 1);
        await handleGenerateTask();
      } else if (currentSequence === 4) {
        toast.success("Bonus complete.");
        setTodayTask(null);
      } else {
        toast.success("All 3 done.");
        setTodayTask(null);
      }
    } catch (error: any) {
      console.error("Complete error:", error);
      toast.error(error.message || "Failed to complete");
    }
  };

  const handleNextRep = async () => {
    setIsGettingRep(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { data, error } = await supabase.functions.invoke("next-rep", {
        body: { timezone }
      });
      if (error) throw error;
      if (data) {
        setNextRep(data);
        setShowRepDialog(true);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to get rep");
    } finally {
      setIsGettingRep(false);
    }
  };

  const handleSkipTask = async () => {
    if (!todayTask || !user || isSkipping) return;
    
    setIsSkipping(true);
    try {
      const now = new Date();
      await supabase.from('user_activity_patterns').insert({
        user_id: user.id,
        hour_of_day: now.getHours(),
        day_of_week: now.getDay(),
        activity_type: 'skip',
        pillar: todayTask?.pillar
      });
      
      await supabase.from("daily_tasks").delete().eq("id", todayTask.id);
      
      setTodayTask(null);
      toast.info("Finding something better...");
      await handleGenerateTask();
    } catch (error: any) {
      console.error("Skip error:", error);
      toast.error("Failed to skip");
    } finally {
      setIsSkipping(false);
    }
  };

  const completedCount = tasksForToday.filter(t => t.completed).length;
  const threeComplete = completedCount >= 3;
  const allDone = completedCount >= 4 || (threeComplete && !tasksForToday.some(t => t.task_sequence === 4));
  const showBonusOption = threeComplete && completedCount === 3 && !tasksForToday.some(t => t.task_sequence === 4);
  
  const energyOptions = [
    { value: "high", label: "High", icon: Battery },
    { value: "medium", label: "Medium", icon: BatteryMedium },
    { value: "low", label: "Low", icon: BatteryLow },
  ];
  
  const timeOptions = [
    { value: "5-10 min", label: "Quick" },
    { value: "20-30 min", label: "Focused" },
    { value: "60+ min", label: "Deep" },
  ];

  const dotsToShow = tasksForToday.some(t => t.task_sequence === 4) ? 4 : 3;

  return (
    <div className="min-h-screen flex flex-col max-w-lg mx-auto px-4 py-6 animate-fade-in overflow-x-hidden w-full">
      {user && (
        <>
          <FirstTimeTooltip userId={user.id} isFirstTime={isFirstTime} />
          <MorningRitualPrompt onComplete={() => setMorningComplete(true)} />
          <EveningLetGo onComplete={() => setEveningComplete(true)} />
          <DayCompleteRecommendations userId={user.id} isComplete={allDone} />
        </>
      )}

      <div className="flex-1 space-y-5">
        {/* Identity Direction Banner - Subtle reminder */}
        {yearNote && !todayTask && !isGenerating && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-primary/5 to-transparent border border-primary/10"
          >
            <Target className="h-4 w-4 text-primary shrink-0" />
            <p className="text-xs text-muted-foreground truncate">
              <span className="text-foreground font-medium">{yearNote.split(' ').slice(0, 6).join(' ')}</span>
              {yearNote.split(' ').length > 6 && "..."}
            </p>
          </motion.div>
        )}

        {/* What's Emerging */}
        {user && <WhatsEmerging userId={user.id} />}
        
        {/* Primary Action - Today's Invitation */}
        <section className="relative">
          {/* Progress indicators - floating top right */}
          <div className="absolute -top-1 right-3 flex items-center gap-1.5 z-10">
            {Array.from({ length: dotsToShow }, (_, i) => i + 1).map((num) => {
              const isCompleted = tasksForToday.some(t => t.task_sequence === num && t.completed);
              const isCurrent = num === currentSequence && !allDone;
              return (
                <motion.div
                  key={num}
                  initial={false}
                  animate={{ 
                    scale: isCurrent ? 1.2 : 1,
                    backgroundColor: isCompleted 
                      ? 'hsl(var(--primary))' 
                      : isCurrent 
                        ? 'hsl(var(--primary) / 0.5)' 
                        : 'hsl(var(--muted-foreground) / 0.2)'
                  }}
                  className="w-2 h-2 rounded-full"
                />
              );
            })}
          </div>

          <div className="rounded-3xl border border-border/40 bg-gradient-to-br from-card via-card to-muted/30 p-6 shadow-soft overflow-hidden relative">
            {/* Subtle weave pattern */}
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none">
              <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <pattern id="weave" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M0 20h40M20 0v40" stroke="currentColor" strokeWidth="0.5" fill="none"/>
                </pattern>
                <rect width="100%" height="100%" fill="url(#weave)"/>
              </svg>
            </div>

            {isGenerating ? (
              <div className="py-16 flex flex-col items-center justify-center relative">
                <WeaveLoader size="lg" text="Weaving your invitation..." />
              </div>
            ) : showBonusOption ? (
              <div className="py-12 text-center space-y-5 relative">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                  <Check className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-display font-semibold">Complete</h2>
                  <p className="text-muted-foreground">Three aligned actions. Well done.</p>
                </div>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => handleGenerateTask({})}
                  className="rounded-2xl h-12 px-6"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  One more
                </Button>
              </div>
            ) : allDone ? (
              <div className="py-16 text-center space-y-4 relative">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                  <Check className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-display font-semibold">Complete</h2>
                  <p className="text-muted-foreground">You showed up. That matters.</p>
                </div>
              </div>
            ) : todayTask ? (
              <div className="space-y-5 relative">
                <div className="flex items-center justify-between">
                  {todayTask.pillar && (
                    <span className="inline-block px-3 py-1.5 rounded-xl text-xs font-medium bg-primary/10 text-primary">
                      {todayTask.pillar}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSkipTask}
                    disabled={isSkipping}
                    className="text-xs text-muted-foreground hover:text-foreground h-8 px-3 rounded-xl"
                  >
                    {isSkipping ? (
                      <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1.5" />
                    )}
                    Not this
                  </Button>
                </div>
                <div className="space-y-3">
                  <h2 className="text-xl font-display font-semibold leading-snug">
                    {todayTask.one_thing}
                  </h2>
                  {todayTask.why_matters && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {todayTask.why_matters}
                    </p>
                  )}
                  {todayTask.description && (
                    <p className="text-xs text-muted-foreground/70 flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      {todayTask.description}
                    </p>
                  )}
                </div>
                <Button 
                  onClick={handleCompleteTask} 
                  className="w-full h-12 rounded-2xl text-base font-medium shadow-soft hover:shadow-elevated transition-all"
                  size="lg"
                >
                  Done <Check className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="py-8 space-y-5 relative">
                {isFirstTime && identitySeed && (
                  <div className="p-4 rounded-2xl bg-muted/50 border border-border/30 text-center">
                    <p className="text-xs text-muted-foreground mb-1.5">You're becoming someone who:</p>
                    <p className="text-sm font-medium text-foreground">{identitySeed}</p>
                  </div>
                )}
                
                {showContextChips ? (
                  <div className="space-y-5 animate-fade-in">
                    <p className="text-sm text-muted-foreground text-center">How are you feeling?</p>
                    
                    <div className="flex flex-wrap gap-2 justify-center">
                      {energyOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setSelectedEnergy(selectedEnergy === opt.value ? null : opt.value)}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                            selectedEnergy === opt.value
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'bg-muted/60 hover:bg-muted text-muted-foreground'
                          }`}
                        >
                          <opt.icon className="h-3.5 w-3.5" />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    
                    <div className="flex flex-wrap gap-2 justify-center">
                      {timeOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setSelectedTime(selectedTime === opt.value ? null : opt.value)}
                          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                            selectedTime === opt.value
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'bg-muted/60 hover:bg-muted text-muted-foreground'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    
                    <div className="flex gap-3 justify-center pt-2">
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={() => {
                          setShowContextChips(false);
                          setSelectedEnergy(null);
                          setSelectedTime(null);
                        }}
                        className="rounded-2xl h-12"
                      >
                        Skip
                      </Button>
                      <Button
                        size="lg"
                        onClick={() => handleGenerateTask({})}
                        className="rounded-2xl h-12"
                      >
                        Get Invitation
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-5">
                    <p className="text-muted-foreground">
                      {isFirstTime ? "Let's get your first invitation" : "Ready for today's focus?"}
                    </p>
                    <Button
                      onClick={() => setShowContextChips(true)}
                      size="lg"
                      className="px-10 h-14 rounded-2xl text-base font-medium shadow-soft hover:shadow-elevated transition-all gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      {isFirstTime ? "Get My First Invitation" : "Start My Day"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Active Experiment - Compact inline */}
        {activeExperiment && (
          <section className="rounded-2xl border border-border/40 bg-gradient-to-br from-card/80 to-muted/10 p-5">
            {(() => {
              const createdDate = new Date(activeExperiment.created_at);
              const now = new Date();
              const startDay = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const dayNumber = Math.floor((today.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)) + 1;
              const currentHour = now.getHours();
              
              const durationStr = activeExperiment.duration?.toLowerCase() || '';
              let totalDays = 7;
              if (durationStr.includes('48h') || durationStr.includes('2 day')) totalDays = 2;
              else if (durationStr.includes('24h') || durationStr.includes('1 day')) totalDays = 1;
              else if (durationStr.includes('3 day')) totalDays = 3;
              else if (durationStr.includes('5 day')) totalDays = 5;
              else if (durationStr.includes('week')) totalDays = 7;
              else if (durationStr.includes('2 week')) totalDays = 14;
              
              const getTimeOfDay = (hour: number) => {
                if (hour >= 5 && hour < 12) return 'Morning';
                if (hour >= 12 && hour < 17) return 'Afternoon';
                if (hour >= 17 && hour < 21) return 'Evening';
                return 'Night';
              };
              const timeOfDay = getTimeOfDay(currentHour);
              
              const steps = activeExperiment.steps?.split('\n').filter((s: string) => s.trim()) || [];
              
              let todayStep = '';
              const stepsPerDay = Math.ceil(steps.length / 7);
              
              if (steps.length <= 7) {
                todayStep = steps[Math.min(dayNumber - 1, steps.length - 1)] || activeExperiment.description;
              } else {
                const baseIndex = (dayNumber - 1) * stepsPerDay;
                const timeSlot = currentHour < 12 ? 0 : currentHour < 18 ? 1 : 2;
                const stepIndex = Math.min(baseIndex + Math.min(timeSlot, stepsPerDay - 1), steps.length - 1);
                todayStep = steps[stepIndex] || activeExperiment.description;
              }
              
              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                      Experiment
                    </span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{timeOfDay}</span>
                      <span className="px-2 py-0.5 rounded-lg bg-muted font-medium">
                        Day {dayNumber}/{totalDays}
                      </span>
                    </div>
                  </div>
                  <p className="text-base font-medium leading-relaxed">
                    {todayStep}
                  </p>
                  {activeExperiment.identity_shift_target && (
                    <p className="text-xs text-primary/70 italic">
                      {activeExperiment.identity_shift_target}
                    </p>
                  )}
                </div>
              );
            })()}
          </section>
        )}

        {/* Next Best Rep - Flowing CTA */}
        <button
          onClick={handleNextRep}
          disabled={isGettingRep}
          className="w-full group text-left"
        >
          <div className="flex items-center gap-4 p-5 rounded-2xl border border-border/40 bg-gradient-to-r from-card/60 to-muted/20 hover:from-card hover:to-muted/30 hover:border-primary/20 transition-all">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center group-hover:from-primary/30 group-hover:to-primary/10 transition-colors shrink-0">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-base">
                {isGettingRep ? "Finding your next move..." : "Feeling off?"}
              </p>
              <p className="text-sm text-muted-foreground">
                One tap. One aligned action.
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
          </div>
        </button>
      </div>

      {/* Next Best Rep Dialog */}
      <Dialog open={showRepDialog} onOpenChange={setShowRepDialog}>
        <DialogContent className="max-w-sm rounded-3xl border-border/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-display">
              <Zap className="h-4 w-4 text-primary" />
              {nextRep?.bucket || "Your Rep"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">Break the drift</DialogDescription>
          </DialogHeader>
          {nextRep && (
            <div className="space-y-5 pt-2">
              <p className="text-lg font-medium leading-relaxed">{nextRep.rep}</p>
              <p className="text-sm text-muted-foreground">{nextRep.why}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border">
                <span>{nextRep.time}</span>
                <span className="px-2 py-1 rounded-lg bg-muted font-medium">{nextRep.bucket}</span>
              </div>
              <Button onClick={() => setShowRepDialog(false)} className="w-full h-12 rounded-2xl">
                Got it
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
