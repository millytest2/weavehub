import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  FileText, 
  Plus, 
  Save, 
  Trash2, 
  X,
  Clock,
  ChevronLeft,
  ArrowLeft
} from "lucide-react";

interface FreeWrite {
  id: string;
  content: string;
  observation_type: string;
  source: string | null;
  created_at: string;
  updated_at?: string;
}

// Provocative questions pulled from identity/experiments
const PROVOCATIVE_QUESTIONS = [
  "What are you afraid to say out loud?",
  "What would you do if you knew you couldn't fail?",
  "What's the hardest truth you're avoiding right now?",
  "If you had to delete everything and start over, what would you rebuild first?",
  "What does the version of you one year from now wish you'd start today?",
  "What keeps showing up that you keep ignoring?",
  "What would make today actually matter?",
  "What are you pretending not to know?",
  "Where are you playing small?",
  "What would you regret NOT doing?",
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Generate a question when starting fresh
  const getProvocativeQuestion = useCallback(async () => {
    if (!user) return PROVOCATIVE_QUESTIONS[Math.floor(Math.random() * PROVOCATIVE_QUESTIONS.length)];
    
    // Try to pull from recent experiments/identity for personalized question
    const { data: identity } = await supabase
      .from("identity_seeds")
      .select("content, weekly_focus")
      .eq("user_id", user.id)
      .maybeSingle();
    
    const { data: recentExperiment } = await supabase
      .from("experiments")
      .select("title, identity_shift_target")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    // Build personalized questions based on context
    const personalQuestions: string[] = [];
    
    if (identity?.weekly_focus) {
      personalQuestions.push(`What's actually blocking you from "${identity.weekly_focus}"?`);
      personalQuestions.push(`If "${identity.weekly_focus}" worked perfectly, what would change?`);
    }
    
    if (recentExperiment?.identity_shift_target) {
      personalQuestions.push(`What would someone who "${recentExperiment.identity_shift_target}" do right now?`);
    }
    
    if (recentExperiment?.title) {
      personalQuestions.push(`What's the real reason you started "${recentExperiment.title}"?`);
    }
    
    // Mix personal with default questions
    const allQuestions = [...personalQuestions, ...PROVOCATIVE_QUESTIONS];
    return allQuestions[Math.floor(Math.random() * allQuestions.length)];
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
