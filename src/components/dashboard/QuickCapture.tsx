import { useState } from "react";
import { Plus, Lightbulb, Compass, Sparkles, Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";
import { detectCareerKeywords } from "@/lib/careerDetection";
import { CareerRedirectPrompt } from "@/components/CareerRedirectPrompt";
import { ReturnToSelfDialog } from "./ReturnToSelfDialog";
import { ManualPasteFallback } from "./ManualPasteFallback";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";

type CaptureType = "paste" | "insight" | null;

const EMOTIONAL_STATES = [
  { id: "scattered", label: "Scattered", desc: "Too many thoughts" },
  { id: "anxious", label: "On edge", desc: "Something feels off" },
  { id: "overthinking", label: "Overthinking", desc: "Stuck in loops" },
  { id: "bored", label: "Bored", desc: "Nothing feels interesting" },
  { id: "lonely", label: "Disconnected", desc: "Far from myself" },
] as const;

type EmotionalState = typeof EMOTIONAL_STATES[number]["id"] | null;

interface ReturnToSelfData {
  identity: string;
  values: string;
  currentReality: string;
  relevantInsight: { title: string; content: string } | null;
  gentleRep: string;
  reminder: string;
  emotionalState?: string;
}

export const QuickCapture = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [captureType, setCaptureType] = useState<CaptureType>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCareerPrompt, setShowCareerPrompt] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [showReturnToSelf, setShowReturnToSelf] = useState(false);
  const [returnToSelfData, setReturnToSelfData] = useState<ReturnToSelfData | null>(null);
  const [isLoadingReturnToSelf, setIsLoadingReturnToSelf] = useState(false);
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [pendingDocumentId, setPendingDocumentId] = useState<string | null>(null);
  const [pendingContentType, setPendingContentType] = useState<string>("");
  const [showEmotionalPicker, setShowEmotionalPicker] = useState(false);
  
  // Voice capture hook
  const { isRecording, isTranscribing, toggleRecording } = useVoiceCapture({
    onTranscript: (text) => {
      setContent(prev => prev ? `${prev}\n${text}` : text);
      toast.success("Voice captured");
    },
  });

  const handleOpen = () => setIsOpen(true);
  
  const handleClose = () => {
    setIsOpen(false);
    setCaptureType(null);
    setContent("");
    setTitle("");
    setShowEmotionalPicker(false);
  };
  const handleQuickCapture = async (type: CaptureType) => {
    setCaptureType(type);
  };

  const processWithBrain = async (input: string): Promise<string> => {
    try {
      const { data, error } = await supabase.functions.invoke("brain", {
        body: { input },
      });
      if (error) throw error;
      return data?.content || input;
    } catch {
      return input;
    }
  };

  const showCareerToastForPaste = (textToCheck: string) => {
    if (detectCareerKeywords(textToCheck)) {
      setTimeout(() => {
        toast("Career clarity on your mind?", {
          description: "Weave is for daily alignment. UPath is designed specifically for career exploration.",
          duration: 8000,
          action: {
            label: "Try UPath",
            onClick: () => window.open('https://upath.ai', '_blank'),
          },
        });
      }, 500);
    }
  };

  const executeSubmit = async () => {
    if (!user || !content.trim()) return;
    
    setIsSubmitting(true);
    try {
      if (captureType === "paste") {
        setIsProcessing(true);
        toast.info("Processing...");
        
        const { data, error } = await supabase.functions.invoke("smart-ingest", {
          body: { input: content },
        });
        
        if (error) throw error;
        
        if (data.needsManualContent && data.documentId) {
          toast.info(data.message);
          setPendingDocumentId(data.documentId);
          setPendingContentType(data.type);
          setShowManualFallback(true);
          setIsSubmitting(false);
          setIsProcessing(false);
          return;
        }
        
        toast.success(data.message || "Saved");
        showCareerToastForPaste(content);
      } else if (captureType === "insight") {
        setIsProcessing(true);
        const processed = await processWithBrain(content);
        
        await supabase.from("insights").insert({
          user_id: user.id,
          title: title || "Quick Insight",
          content: processed,
          source: "quick_capture",
        });
        toast.success("Insight captured");
      }
      
      handleClose();
    } catch (error: any) {
      console.error("Capture error:", error);
      toast.error(error.message || "Failed to capture");
    } finally {
      setIsSubmitting(false);
      setIsProcessing(false);
    }
  };

  const handleSubmit = () => {
    if (!user || !content.trim()) return;
    
    if (captureType !== "paste") {
      const textToCheck = `${title} ${content}`;
      if (detectCareerKeywords(textToCheck)) {
        setPendingSubmit(true);
        setShowCareerPrompt(true);
        return;
      }
    }
    
    executeSubmit();
  };

  const handleCareerPromptContinue = () => {
    setPendingSubmit(false);
    executeSubmit();
  };

  const handleReturnToSelfWithState = async (emotionalState: EmotionalState) => {
    setShowEmotionalPicker(false);
    setIsLoadingReturnToSelf(true);
    setShowReturnToSelf(true);
    setIsOpen(false);
    
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { data, error } = await supabase.functions.invoke("return-to-self", {
        body: { timezone, emotionalState }
      });
      if (error) throw error;
      setReturnToSelfData(data);
    } catch (error) {
      console.error("Return to self error:", error);
      setReturnToSelfData({
        identity: "You are becoming someone aligned with your values.",
        values: "Growth, Presence, Creation",
        currentReality: "You are here. That is enough.",
        relevantInsight: null,
        gentleRep: "Take three slow breaths. Feel your feet on the ground. You are here.",
        reminder: "You are becoming who you said you'd become."
      });
    } finally {
      setIsLoadingReturnToSelf(false);
    }
  };

  const handleReturnToSelfClick = () => {
    setShowEmotionalPicker(true);
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-20 md:bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center justify-center"
        aria-label="Quick capture"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Capture Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md mx-auto rounded-xl p-4 sm:p-6">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base sm:text-lg">
              {captureType ? (
                <button onClick={() => setCaptureType(null)} className="text-muted-foreground hover:text-foreground text-sm">
                  ← Back
                </button>
              ) : (
                "Capture"
              )}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {captureType ? "Add your content below" : "Save or reflect"}
            </DialogDescription>
          </DialogHeader>

          {showEmotionalPicker ? (
            <div className="space-y-4 py-3">
              <p className="text-sm text-muted-foreground">What's happening right now?</p>
              <div className="grid grid-cols-2 gap-2">
                {EMOTIONAL_STATES.map((state) => (
                  <button
                    key={state.id}
                    onClick={() => handleReturnToSelfWithState(state.id)}
                    className="flex flex-col items-start p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
                  >
                    <span className="text-sm font-medium">{state.label}</span>
                    <span className="text-xs text-muted-foreground">{state.desc}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => handleReturnToSelfWithState(null)}
                className="w-full p-3 rounded-lg border border-border/50 hover:border-border text-sm text-muted-foreground hover:text-foreground transition-all"
              >
                Just ground me
              </button>
              <button
                onClick={() => setShowEmotionalPicker(false)}
                className="w-full text-xs text-muted-foreground hover:text-foreground"
              >
                ← Back
              </button>
            </div>
          ) : !captureType ? (
            <div className="space-y-3 py-3">
              {/* Return to Self - Primary */}
              <button
                onClick={handleReturnToSelfClick}
                className="w-full flex items-center gap-3 p-4 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all text-left"
              >
                <Compass className="h-6 w-6 text-primary shrink-0" />
                <div>
                  <span className="text-sm font-medium block">Return to Self</span>
                  <span className="text-xs text-muted-foreground">Drifting? Ground yourself here.</span>
                </div>
              </button>

              {/* Smart Paste */}
              <button
                onClick={() => handleQuickCapture("paste")}
                className="w-full flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
              >
                <Sparkles className="h-6 w-6 text-primary shrink-0" />
                <div>
                  <span className="text-sm font-medium block">Paste Anything</span>
                  <span className="text-xs text-muted-foreground">YouTube, article, tweet, Instagram - auto-detect</span>
                </div>
              </button>

              {/* Manual Insight */}
              <button
                onClick={() => handleQuickCapture("insight")}
                className="w-full flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
              >
                <Lightbulb className="h-6 w-6 text-primary shrink-0" />
                <div>
                  <span className="text-sm font-medium block">Manual Insight</span>
                  <span className="text-xs text-muted-foreground">Type or dictate your thought</span>
                </div>
              </button>
              
              {/* Voice Insight - primary voice capture */}
              <button
                onClick={() => {
                  handleQuickCapture("insight");
                  setTimeout(() => toggleRecording(), 100);
                }}
                className="w-full flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/30 hover:border-primary/50 transition-all text-left"
              >
                <Mic className="h-6 w-6 text-primary shrink-0" />
                <div>
                  <span className="text-sm font-medium block">Speak Your Insight</span>
                  <span className="text-xs text-muted-foreground">Just talk. No typing needed.</span>
                </div>
              </button>
            </div>
          ) : (
            <div className="space-y-3 py-3">
              {captureType === "insight" && (
                <Input
                  placeholder="Title (optional)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-10 text-base"
                  style={{ fontSize: '16px' }}
                />
              )}
              
              <div className="relative">
                <Textarea
                  placeholder={
                    captureType === "paste"
                      ? "Paste any URL (YouTube, article, tweet, Instagram...)"
                      : "What did you learn or realize?"
                  }
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[100px] sm:min-h-[120px] text-base pr-12"
                  style={{ fontSize: '16px' }}
                  autoFocus
                />
                
                {/* Voice input button */}
                {captureType === "insight" && (
                  <button
                    type="button"
                    onClick={toggleRecording}
                    disabled={isTranscribing}
                    className={`absolute right-2 bottom-2 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      isRecording 
                        ? 'bg-destructive text-destructive-foreground animate-pulse' 
                        : isTranscribing
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-primary/10 text-primary hover:bg-primary/20'
                    }`}
                    aria-label={isRecording ? "Stop recording" : "Start voice input"}
                  >
                    {isTranscribing ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : isRecording ? (
                      <MicOff className="h-5 w-5" />
                    ) : (
                      <Mic className="h-5 w-5" />
                    )}
                  </button>
                )}
              </div>
              
              {isRecording && (
                <p className="text-xs text-destructive animate-pulse">
                  Recording... tap mic to stop
                </p>
              )}
              
              {isTranscribing && (
                <p className="text-xs text-muted-foreground animate-pulse">
                  Transcribing...
                </p>
              )}
              
              {isProcessing && (
                <p className="text-xs text-muted-foreground animate-pulse">
                  {captureType === "paste" ? "Detecting content and extracting..." : "Processing with AI..."}
                </p>
              )}
              
              <Button
                onClick={handleSubmit}
                disabled={!content.trim() || isSubmitting || isRecording || isTranscribing}
                className="w-full h-10"
              >
                {isSubmitting 
                  ? "Processing..." 
                  : (captureType === "paste" ? "Save & Extract" : "Capture")
                }
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CareerRedirectPrompt
        open={showCareerPrompt}
        onOpenChange={(open) => {
          setShowCareerPrompt(open);
          if (!open && !pendingSubmit) {
            setPendingSubmit(false);
          }
        }}
        onContinue={handleCareerPromptContinue}
      />

      <ReturnToSelfDialog
        open={showReturnToSelf}
        onOpenChange={setShowReturnToSelf}
        data={returnToSelfData}
        isLoading={isLoadingReturnToSelf}
      />

      <ManualPasteFallback
        open={showManualFallback}
        onOpenChange={setShowManualFallback}
        documentId={pendingDocumentId}
        contentType={pendingContentType}
        onComplete={() => {
          handleClose();
          setPendingDocumentId(null);
          setPendingContentType("");
        }}
      />
    </>
  );
};
