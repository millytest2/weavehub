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
  X,
  Network,
  Mic,
  MicOff,
  Search,
  BookOpen,
  PenLine,
  Brain,
  Compass
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MultiPlatformPostDialog } from "./MultiPlatformPostDialog";
import { useVoiceCaptureWebSpeech } from "@/hooks/useVoiceCaptureWebSpeech";
import { Input } from "@/components/ui/input";

type EntryType = "journal" | "content" | "braindump" | "adventure";

const ENTRY_TYPES: { key: EntryType; label: string; icon: typeof BookOpen; color: string }[] = [
  { key: "journal", label: "Journal", icon: BookOpen, color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  { key: "content", label: "Content", icon: PenLine, color: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30" },
  { key: "braindump", label: "Brain Dump", icon: Brain, color: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30" },
  { key: "adventure", label: "Adventure", icon: Compass, color: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30" },
];

interface FreeWrite {
  id: string;
  content: string;
  observation_type: string;
  source: string | null;
  created_at: string;
  updated_at?: string;
  platform?: string | null; // reuse platform field for entry_type tag
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
  const [showMultiPlatform, setShowMultiPlatform] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<EntryType | "all">("all");
  const [activeEntryType, setActiveEntryType] = useState<EntryType>("journal");
  
  // Voice capture for brain dump mode
  const voice = useVoiceCaptureWebSpeech({
    onTranscript: (text) => {
      if (activeWrite) {
        const newContent = content ? `${content}\n\n${text}` : text;
        handleContentChange(newContent);
        setContent(newContent);
      }
    },
    maxDuration: 300, // 5 min voice sessions
  });
  
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

  const handleNewWrite = async (type: EntryType = "journal") => {
    if (!user) return;
    setIsCreating(true);
    setActiveEntryType(type);
    
    // Get a provocative question to start with
    const question = await getProvocativeQuestion();
    setProvocativeQuestion(question);
    
    const { data, error } = await supabase
      .from("observations")
      .insert({
        user_id: user.id,
        observation_type: "freewrite",
        content: "",
        source: null,
        platform: type, // reuse platform field to store entry type
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

  const handleRefineContent = async () => {
    if (!generatedContent) return;
    setIsGeneratingContent(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("synthesizer", {
        body: {
          mode: "freewrite_to_content",
          freewrite: `Original thought: ${content}\n\nPrevious draft: ${generatedContent}\n\nMake it more punchy and authentic. Find the real core.`,
        }
      });

      if (error) throw error;
      setGeneratedContent(data.post || generatedContent);
    } catch (error: any) {
      toast.error("Couldn't refine");
    } finally {
      setIsGeneratingContent(false);
    }
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
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {/* Voice brain dump toggle */}
            <Button
              variant={voice.isRecording ? "destructive" : "outline"}
              size="sm"
              onClick={voice.toggleRecording}
              disabled={voice.isTranscribing}
              className="gap-1.5"
            >
              {voice.isRecording ? (
                <>
                  <MicOff className="h-3.5 w-3.5" />
                  {voice.formattedDuration}
                </>
              ) : (
                <>
                  <Mic className="h-3.5 w-3.5" />
                  Talk
                </>
              )}
            </Button>
            
            {voice.isRecording && voice.interimTranscript && (
              <span className="text-[10px] text-muted-foreground/60 max-w-[120px] truncate">
                {voice.interimTranscript}
              </span>
            )}

            {isSaving && (
              <span className="flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                Saving...
              </span>
            )}
            {lastSaved && !isSaving && (
              <span className="flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                Saved
              </span>
            )}
            <span>{getWordCount(content)} words</span>
            
            {/* Turn into content button - only show if enough content */}
            {getWordCount(content) >= 20 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateContent}
                  disabled={isGeneratingContent}
                  className="ml-2 text-primary hover:text-primary"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Find the gold
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMultiPlatform(true)}
                  className="text-accent-foreground hover:text-accent-foreground"
                >
                  <Network className="h-3.5 w-3.5 mr-1.5" />
                  Publish
                </Button>
              </>
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
                The gold from your thinking
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {isGeneratingContent ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-muted-foreground">Finding the core insight...</p>
                </div>
              ) : generatedContent ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Extracted from your raw thinking. Edit as needed.
                  </p>
                  <div className="p-4 bg-muted/30 rounded-xl text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto border border-border/50">
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
                      onClick={handleRefineContent}
                      disabled={isGeneratingContent}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Refine
                    </Button>
                    <Button 
                      variant="ghost" 
                      onClick={() => setShowContentDialog(false)}
                    >
                      <X className="h-4 w-4" />
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

        {/* Multi-Platform Publish Dialog */}
        <MultiPlatformPostDialog
          open={showMultiPlatform}
          onOpenChange={setShowMultiPlatform}
          connection={{
            title: content.trim().split('\n')[0]?.slice(0, 80) || "Journal Entry",
            insight: content,
            domains: ["journal"],
          }}
        />
      </div>
    );
  }

  // Filter writes by search and type
  const filteredWrites = writes.filter(w => {
    const matchesSearch = !searchQuery.trim() || w.content.toLowerCase().includes(searchQuery.toLowerCase());
    const entryType = (w.platform as EntryType) || "journal";
    const matchesType = filterType === "all" || entryType === filterType;
    return matchesSearch && matchesType;
  });

  const getEntryTypeConfig = (write: FreeWrite) => {
    const type = (write.platform as EntryType) || "journal";
    return ENTRY_TYPES.find(t => t.key === type) || ENTRY_TYPES[0];
  };

  // List view
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <p className="text-sm text-muted-foreground">Blank page. Just write. Brain dump. Let it flow.</p>
      </div>

      {/* Entry type quick-create buttons */}
      <div className="flex flex-wrap gap-2">
        {ENTRY_TYPES.map((type) => (
          <Button
            key={type.key}
            size="sm"
            variant="outline"
            className={`gap-1.5 ${type.color} border`}
            onClick={() => handleNewWrite(type.key)}
            disabled={isCreating}
          >
            <type.icon className="h-3.5 w-3.5" />
            {type.label}
          </Button>
        ))}
      </div>

      {/* Filter chips + search */}
      {writes.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setFilterType("all")}
              className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                filterType === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              All ({writes.length})
            </button>
            {ENTRY_TYPES.map((type) => {
              const count = writes.filter(w => (w.platform || "journal") === type.key).length;
              if (count === 0) return null;
              return (
                <button
                  key={type.key}
                  onClick={() => setFilterType(type.key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1 ${
                    filterType === type.key
                      ? `${type.color} border`
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <type.icon className="h-3 w-3" /> {type.label} ({count})
                </button>
              );
            })}
          </div>
          {writes.length > 3 && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-8 text-sm"
              />
            </div>
          )}
        </div>
      )}

      {filteredWrites.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filteredWrites.map((write) => {
            const preview = write.content.trim().slice(0, 150);
            const firstLine = write.content.trim().split('\n')[0].slice(0, 50) || "Untitled";
            const wordCount = getWordCount(write.content);
            const typeConfig = getEntryTypeConfig(write);
            
            return (
              <Card 
                key={write.id}
                className="cursor-pointer hover:border-primary/50 transition-colors group"
                onClick={() => handleOpenWrite(write)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <typeConfig.icon className="h-3.5 w-3.5 text-muted-foreground" />
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
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${typeConfig.color} border`}>
                      {typeConfig.label}
                    </span>
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
      ) : writes.length > 0 && (searchQuery || filterType !== "all") ? (
        <p className="text-sm text-muted-foreground text-center py-8">No entries matching your filter</p>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground mb-2">No pages yet</p>
            <p className="text-sm text-muted-foreground/60 mb-4 max-w-md mx-auto">
              Pick a type above and start writing. Everything weaves into your 2026 vision.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
