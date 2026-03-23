import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, Minus, X, Moon } from "lucide-react";
import { toast } from "sonner";

interface CommittedAction {
  id?: string;
  one_thing: string;
  pillar?: string;
  completed?: boolean;
}

interface EveningCloseProps {
  userId: string;
  committedActions: CommittedAction[];
  briefId?: string;
}

type CompletionStatus = 'completed' | 'partial' | 'skipped';

export function EveningClose({ userId, committedActions, briefId }: EveningCloseProps) {
  const [open, setOpen] = useState(false);
  const [actionStatuses, setActionStatuses] = useState<Record<string, CompletionStatus>>({});
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});
  const [journalEntry, setJournalEntry] = useState('');
  const [patternsNoticed, setPatternsNoticed] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkIfShouldShow();
  }, [userId]);

  const checkIfShouldShow = async () => {
    const today = new Date().toISOString().split('T')[0];
    const key = `weave_evening_close_${userId}`;
    const lastClose = localStorage.getItem(key);
    if (lastClose === today) return;

    // Check identity exists (only show to set-up users)
    const { data: identity } = await supabase
      .from("identity_seeds")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (identity) {
      // Pre-fill statuses from completed actions
      const statuses: Record<string, CompletionStatus> = {};
      committedActions.forEach(a => {
        if (a.id) statuses[a.id] = a.completed ? 'completed' : 'skipped';
      });
      setActionStatuses(statuses);
      setOpen(true);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // Save action completions
      const completions = committedActions
        .filter(a => a.id && actionStatuses[a.id])
        .map(a => ({
          user_id: userId,
          daily_task_id: a.id!,
          completion_date: today,
          status: actionStatuses[a.id!] || 'skipped',
          what_happened: actionNotes[a.id!] || null,
        }));

      if (completions.length > 0) {
        await supabase.from("action_completions").insert(completions);
      }

      // Save daily close
      if (journalEntry.trim() || patternsNoticed.trim()) {
        await supabase.from("daily_closes").upsert({
          user_id: userId,
          close_date: today,
          daily_brief_id: briefId || null,
          journal_entry: journalEntry.trim() || null,
          patterns_noticed: patternsNoticed.trim() || null,
        }, { onConflict: 'user_id,close_date' });

        // Also save journal as an insight for future retrieval
        if (journalEntry.trim()) {
          const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
          await supabase.from("insights").insert({
            user_id: userId,
            title: `Evening Journal — ${dayName}`,
            content: journalEntry.trim() + (patternsNoticed.trim() ? `\n\nPatterns: ${patternsNoticed.trim()}` : ''),
            source: "evening_journal"
          });
        }
      }

      localStorage.setItem(`weave_evening_close_${userId}`, today);
      setOpen(false);
      toast.success("Day closed. Rest well.");
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = () => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(`weave_evening_close_${userId}`, today);
    setOpen(false);
  };

  if (!open) return null;

  const statusIcon = (status: CompletionStatus) => {
    switch (status) {
      case 'completed': return <Check className="h-4 w-4 text-primary" />;
      case 'partial': return <Minus className="h-4 w-4 text-amber-500" />;
      case 'skipped': return <X className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleDismiss()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md p-0 overflow-hidden border border-border/50 bg-gradient-to-b from-card via-card to-muted/30 shadow-elevated rounded-3xl max-h-[90vh] overflow-y-auto">
        <div className="h-1 w-full bg-gradient-to-r from-indigo-400/40 via-indigo-500 to-indigo-400/40" />

        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
              Evening
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={handleDismiss}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-2xl font-display font-semibold tracking-tight flex items-center gap-2">
              <Moon className="h-5 w-5 text-indigo-400" />
              Close the day
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              How did your commitments go?
            </DialogDescription>
          </DialogHeader>

          {/* Committed Actions Review */}
          <div className="space-y-3">
            {committedActions.map((action, idx) => {
              const id = action.id || `action-${idx}`;
              const status = actionStatuses[id];

              return (
                <div key={id} className="rounded-xl border border-border/40 p-4 space-y-3">
                  <p className="text-sm font-medium">{action.one_thing}</p>

                  {/* Status buttons */}
                  <div className="flex gap-2">
                    {(['completed', 'partial', 'skipped'] as CompletionStatus[]).map(s => (
                      <button
                        key={s}
                        onClick={() => setActionStatuses(prev => ({ ...prev, [id]: s }))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          status === s
                            ? s === 'completed' ? 'bg-primary/15 text-primary border border-primary/30'
                            : s === 'partial' ? 'bg-amber-500/15 text-amber-600 border border-amber-500/30'
                            : 'bg-muted text-muted-foreground border border-border'
                            : 'bg-muted/30 text-muted-foreground/60 hover:bg-muted/50'
                        }`}
                      >
                        {statusIcon(s)}
                        {s === 'completed' ? 'Done' : s === 'partial' ? 'Partially' : "Didn't do"}
                      </button>
                    ))}
                  </div>

                  {/* What happened (optional) */}
                  {status && (
                    <Textarea
                      value={actionNotes[id] || ''}
                      onChange={(e) => setActionNotes(prev => ({ ...prev, [id]: e.target.value }))}
                      placeholder="What happened? (optional)"
                      className="min-h-[50px] text-xs resize-none bg-muted/30 border-border/50 rounded-xl"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Journal */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              What did you notice today?
            </label>
            <Textarea
              value={journalEntry}
              onChange={(e) => setJournalEntry(e.target.value)}
              placeholder="Anything on your mind... this feeds tomorrow's brief"
              className="min-h-[70px] text-sm resize-none bg-muted/30 border-border/50 rounded-xl focus-visible:ring-1"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Any patterns or insights?
            </label>
            <Textarea
              value={patternsNoticed}
              onChange={(e) => setPatternsNoticed(e.target.value)}
              placeholder="What are you learning about yourself..."
              className="min-h-[50px] text-sm resize-none bg-muted/30 border-border/50 rounded-xl focus-visible:ring-1"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              size="lg"
              className="flex-1 text-sm text-muted-foreground rounded-2xl h-12"
              onClick={handleDismiss}
            >
              Not tonight
            </Button>
            <Button
              size="lg"
              className="flex-1 text-sm rounded-2xl h-12 font-medium"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save & Close Day"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
