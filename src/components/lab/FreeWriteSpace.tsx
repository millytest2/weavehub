import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  FileText, 
  Plus, 
  Trash2, 
  Clock,
  ArrowLeft,
  Sparkles,
  Copy,
  Check,
  X
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface FreeWrite {
  id: string;
  content: string;
  observation_type: string;
  source: string | null;
  created_at: string;
  updated_at?: string;
}

// Short, punchy default provocations
const DEFAULT_PROVOCATIONS = [
  "What are you avoiding?",
  "What would scare you to do today?",
  "What do you already know?",
  "Where are you playing small?",
  "What would you regret not doing?",
  "What keeps showing up?",
  "What's the real issue?",
  "What would they do?",
];

export const FreeWriteSpace = () => {
  const { user } = useAuth();
  const [writes, setWrites] = useState<FreeWrite[]>([]);
  const [activeWrite, setActiveWrite] = useState<FreeWrite | null>(null);
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [provocativeQuestion, setProvocativeQuestion] = useState<string | null>(null);
  const [showContentDialog, setShowContentDialog] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Generate a SHORT, personalized question from latest user data
  const getProvocativeQuestion = useCallback(async () => {
    if (!user) return DEFAULT_PROVOCATIONS[Math.floor(Math.random() * DEFAULT_PROVOCATIONS.length)];
    
    const personalQuestions: string[] = [];
    
    // 1. Check recent emotional patterns (grounding_log)
    const { data: recentEmotions } = await supabase
      .from("grounding_log")
      .select("emotional_state")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3);
    
    if (recentEmotions?.length) {
      const topEmotion = recentEmotions[0].emotional_state;
      if (topEmotion) {
        personalQuestions.push(`Why ${topEmotion}?`);
        personalQuestions.push(`What's under the ${topEmotion}?`);
      }
    }
    
    // 2. Pull from identity_seeds (values, year_note, phase)
    const { data: identity } = await supabase
      .from("identity_seeds")
      .select("core_values, year_note, current_phase, weekly_focus")
      .eq("user_id", user.id)
      .maybeSingle();
    
    if (identity?.core_values && Array.isArray(identity.core_values) && identity.core_values.length > 0) {
      const value = identity.core_values[Math.floor(Math.random() * identity.core_values.length)];
      personalQuestions.push(`Did you honor "${value}" today?`);
    }
    
    if (identity?.year_note) {
      // Extract first key phrase (short)
      const firstPhrase = identity.year_note.split(/[.!?\n]/)[0]?.trim().slice(0, 30);
      if (firstPhrase) {
        personalQuestions.push(`Is "${firstPhrase}..." still true?`);
      }
    }
    
    if (identity?.weekly_focus) {
      personalQuestions.push(`What's blocking "${identity.weekly_focus.slice(0, 25)}"?`);
    }
    
    // 3. Check active goals
    const { data: goals } = await supabase
      .from("user_goals")
      .select("goal_name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (goals?.goal_name) {
      personalQuestions.push(`What would move "${goals.goal_name.slice(0, 20)}" forward?`);
    }
    
    // 4. Check latest experiment
    const { data: experiment } = await supabase
      .from("experiments")
      .select("identity_shift_target")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (experiment?.identity_shift_target) {
      const shift = experiment.identity_shift_target.slice(0, 25);
      personalQuestions.push(`Are you being "${shift}"?`);
    }
    
    // Prioritize personal questions, fallback to defaults
    if (personalQuestions.length > 0) {
      return personalQuestions[Math.floor(Math.random() * personalQuestions.length)];
    }
    
    return DEFAULT_PROVOCATIONS[Math.floor(Math.random() * DEFAULT_PROVOCATIONS.length)];
  }, [user]);

  const fetchWrites = useCallback(async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from("observations")
      .select("*")
      .eq("user_id", user.id)
      .eq("observation_type", "freewrite")
      .order("created_at", { ascending: false });
    
    if (!error && data) {
      setWrites(data as FreeWrite[]);
    }
  }, [user]);

  useEffect(() => {
    fetchWrites();
  }, [fetchWrites]);

  // Auto-save with debounce
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    if (activeWrite) {
      saveTimeoutRef.current = setTimeout(async () => {
        if (!user || !activeWrite) return;
        
        setIsSaving(true);
        const { error } = await supabase
          .from("observations")
          .update({ 
            content: newContent,
          })
          .eq("id", activeWrite.id);
        
        if (!error) {
          setLastSaved(new Date());
        }
        setIsSaving(false);
      }, 1500);
    }
  }, [activeWrite, user]);

  const handleNewWrite = async () => {
    if (!user) return;
    setIsCreating(true);
    
    // Get a provocative question to start with
    const question = await getProvocativeQuestion();
    setProvocativeQuestion(question);
    
    const { data, error } = await supabase
      .from("observations")
      .insert({
        user_id: user.id,
        observation_type: "freewrite",
        content: "",
        source: null
      })
      .select()
      .single();
    
    if (!error && data) {
      setWrites(prev => [data as FreeWrite, ...prev]);
      setActiveWrite(data as FreeWrite);
      setContent("");
      setLastSaved(null);
      
      // Focus the textarea
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
    setIsCreating(false);
  };

  const handleOpenWrite = (write: FreeWrite) => {
    setActiveWrite(write);
    setContent(write.content);
    setLastSaved(null);
    setProvocativeQuestion(null); // Don't show question for existing writes
    
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  };

  const handleCloseWrite = async () => {
    // Final save before closing
    if (activeWrite && content !== activeWrite.content) {
      await supabase
        .from("observations")
        .update({ content })
        .eq("id", activeWrite.id);
    }
    
    setActiveWrite(null);
    setContent("");
    setLastSaved(null);
    fetchWrites();
  };

  const handleDeleteWrite = async (id: string) => {
    const { error } = await supabase
      .from("observations")
      .delete()
      .eq("id", id);
    
    if (!error) {
      setWrites(prev => prev.filter(w => w.id !== id));
      if (activeWrite?.id === id) {
        setActiveWrite(null);
        setContent("");
      }
      toast.success("Deleted");
    }
  };

  const getWordCount = (text: string) => {
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  const handleGenerateContent = async () => {
    if (!content.trim() || getWordCount(content) < 20) {
      toast.error("Write at least 20 words first");
      return;
    }
    
    setIsGeneratingContent(true);
    setShowContentDialog(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("synthesizer", {
        body: {
          mode: "freewrite_to_content",
          freewrite: content,
        }
      });

      if (error) throw error;
      
      setGeneratedContent(data.post || "Could not generate content");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate content");
      setGeneratedContent("");
    } finally {
      setIsGeneratingContent(false);
    }
  };

  const handleCopyContent = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied!");
  };

  // Full-screen writing mode
  if (activeWrite) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {/* Minimal header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleCloseWrite}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {isSaving && (
              <span className="flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                Saving...
              </span>
            )}
            {lastSaved && !isSaving && (
              <span className="flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Saved
              </span>
            )}
            <span>{getWordCount(content)} words</span>
            
            {/* Turn into content button - only show if enough content */}
            {getWordCount(content) >= 20 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGenerateContent}
                disabled={isGeneratingContent}
                className="ml-2 text-primary hover:text-primary"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Turn into content
              </Button>
            )}
          </div>
        </div>
        
        {/* Writing area - full screen, distraction free */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Provocative question - only show on new writes with no content */}
          {provocativeQuestion && content.length === 0 && (
            <div className="px-6 md:px-12 lg:px-[15%] pt-6">
              <p className="text-muted-foreground/60 italic text-lg" style={{ fontFamily: 'Georgia, serif' }}>
                {provocativeQuestion}
              </p>
            </div>
          )}
          
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              handleContentChange(e.target.value);
              // Clear question once they start typing
              if (provocativeQuestion && e.target.value.length > 0) {
                setProvocativeQuestion(null);
              }
            }}
            placeholder="Just write..."
            className="w-full flex-1 p-6 md:p-12 lg:px-[15%] text-lg leading-relaxed bg-transparent resize-none focus:outline-none placeholder:text-muted-foreground/30"
            style={{ 
              fontFamily: 'Georgia, serif',
              letterSpacing: '0.01em'
            }}
          />
        </div>

        {/* Content Generation Dialog */}
        <Dialog open={showContentDialog} onOpenChange={setShowContentDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Your Content
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {isGeneratingContent ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : generatedContent ? (
                <>
                  <div className="p-4 bg-muted/30 rounded-lg text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                    {generatedContent}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleCopyContent} 
                      className="flex-1"
                      variant={copied ? "secondary" : "default"}
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy
                        </>
                      )}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setShowContentDialog(false)}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Close
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  Something went wrong. Try again.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-muted-foreground">Blank page. Just write. Brain dump. Let it flow.</p>
        </div>
        <Button size="sm" onClick={handleNewWrite} disabled={isCreating}>
          <Plus className="h-4 w-4 mr-2" />
          New Page
        </Button>
      </div>

      {writes.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {writes.map((write) => {
            const preview = write.content.trim().slice(0, 150);
            const firstLine = write.content.trim().split('\n')[0].slice(0, 50) || "Untitled";
            const wordCount = getWordCount(write.content);
            
            return (
              <Card 
                key={write.id}
                className="cursor-pointer hover:border-primary/50 transition-colors group"
                onClick={() => handleOpenWrite(write)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium truncate max-w-[180px]">
                        {firstLine || "Empty"}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteWrite(write.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                  
                  {preview && (
                    <p className="text-xs text-muted-foreground line-clamp-3 mb-3">
                      {preview}...
                    </p>
                  )}
                  
                  <div className="flex items-center gap-3 text-xs text-muted-foreground/70">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(write.created_at), "MMM d")}
                    </span>
                    <span>{wordCount} words</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground mb-2">No pages yet</p>
            <p className="text-sm text-muted-foreground/60 mb-4 max-w-md mx-auto">
              A blank page. No prompts. No AI. Just you and your thoughts.
            </p>
            <Button onClick={handleNewWrite} disabled={isCreating}>
              <Plus className="h-4 w-4 mr-2" />
              Start Writing
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
