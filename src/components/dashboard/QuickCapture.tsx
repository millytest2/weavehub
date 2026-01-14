import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, Compass, Sparkles, Mic, MicOff, Loader2, Zap, Waves, Target } from "lucide-react";
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
import { RealignDialog, RealignData } from "./RealignDialog";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";

type CaptureType = "paste" | "insight" | null;
type RealignMode = "push" | "flow" | null;

// Weave-aligned states: about patterns and identity, not emotions
const FEELING_OFF_STATES = [
  { id: "scattered", label: "Scattered", desc: "Need to refocus on one thread" },
  { id: "drifting", label: "Drifting", desc: "Lost sight of my direction" },
  { id: "stuck", label: "Stuck", desc: "Can't start, need a first rep" },
  { id: "disconnected", label: "Disconnected", desc: "Far from who I'm becoming" },
  { id: "overloaded", label: "Overloaded", desc: "Too many inputs, need to filter" },
] as const;

type EmotionalState = typeof FEELING_OFF_STATES[number]["id"] | null;

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
  const [showRealignPicker, setShowRealignPicker] = useState(false);
  const [showRealign, setShowRealign] = useState(false);
  const [realignData, setRealignData] = useState<RealignData | null>(null);
  const [isLoadingRealign, setIsLoadingRealign] = useState(false);
  
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
    setShowRealignPicker(false);
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

  const handleRealignClick = () => {
    setShowRealignPicker(true);
  };

  const handleRealign = async (mode: RealignMode) => {
    if (!mode) return;
    setShowRealignPicker(false);
    setIsLoadingRealign(true);
    setShowRealign(true);
    setIsOpen(false);
    
    try {
      const { data, error } = await supabase.functions.invoke("realign", {
        body: { mode }
      });
      if (error) throw error;
      setRealignData(data);
    } catch (error) {
      console.error("Realign error:", error);
      setRealignData({
        mode,
        headline: mode === "push" ? "You're building momentum" : "You're already aligned",
        currentState: "You are here, ready to move.",
        dreamReality: "The version of you that has already arrived.",
        oneMove: mode === "push" 
          ? "What's the hardest thing you've been avoiding? Start there."
          : "What feels right to do next? Trust that."
      });
    } finally {
      setIsLoadingRealign(false);
    }
  };

  return (
    <>
      {/* Floating Action Button - Now "Weave" with micro-interactions */}
      <motion.button
        onClick={handleOpen}
        className="fixed bottom-20 md:bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
        aria-label="Weave"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ 
          scale: 1.1, 
          boxShadow: "0 20px 40px -10px hsl(var(--primary) / 0.4)"
        }}
        whileTap={{ scale: 0.95 }}
        transition={{ 
          type: "spring", 
          stiffness: 400, 
          damping: 17,
          opacity: { duration: 0.2 }
        }}
      >
        <motion.div
          animate={isOpen ? { rotate: 45 } : { rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <Sparkles className="h-5 w-5" />
        </motion.div>
      </motion.button>

      {/* Unified Weave Menu */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm mx-auto rounded-xl p-4">
          <DialogHeader className="pb-1">
            <DialogTitle className="text-base">
              {captureType ? (
                <button onClick={() => setCaptureType(null)} className="text-muted-foreground hover:text-foreground text-sm">
                  ← Back
                </button>
              ) : showRealignPicker || showEmotionalPicker ? (
                <button 
                  onClick={() => { setShowRealignPicker(false); setShowEmotionalPicker(false); }} 
                  className="text-muted-foreground hover:text-foreground text-sm"
                >
                  ← Back
                </button>
              ) : (
                "Weave"
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">Quick actions</DialogDescription>
          </DialogHeader>

          {showRealignPicker ? (
            <div className="space-y-3 py-3">
              <p className="text-xs text-muted-foreground text-center mb-2">Choose your mode</p>
              <button
                onClick={() => handleRealign("push")}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-transparent bg-gradient-to-r from-amber-500/10 to-orange-500/10 hover:border-orange-500/40 hover:shadow-md transition-all duration-200 text-left group"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Zap className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-semibold block">Push</span>
                  <span className="text-xs text-muted-foreground">Show me the gap between where I am and where I'm going</span>
                </div>
              </button>
              <button
                onClick={() => handleRealign("flow")}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-transparent bg-gradient-to-r from-blue-500/10 to-cyan-500/10 hover:border-blue-500/40 hover:shadow-md transition-all duration-200 text-left group"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Waves className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-semibold block">Flow</span>
                  <span className="text-xs text-muted-foreground">Ground me in what matters today</span>
                </div>
              </button>
            </div>
          ) : showEmotionalPicker ? (
            <div className="space-y-3 py-3">
              <p className="text-xs text-muted-foreground text-center mb-2">What's pulling you off center?</p>
              <div className="grid grid-cols-2 gap-2">
                {FEELING_OFF_STATES.map((state) => (
                  <button
                    key={state.id}
                    onClick={() => handleReturnToSelfWithState(state.id)}
                    className="flex flex-col items-start p-3 rounded-xl border border-border/60 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 text-left group"
                  >
                    <span className="text-sm font-medium group-hover:text-primary transition-colors">{state.label}</span>
                    <span className="text-xs text-muted-foreground mt-0.5">{state.desc}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => handleReturnToSelfWithState(null)}
                className="w-full p-3 rounded-xl bg-muted/50 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
              >
                Just ground me
              </button>
            </div>
          ) : !captureType ? (
            <div className="space-y-2 py-2">
              {/* Primary row: Realign + Return to Self */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleRealignClick}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all"
                >
                  <Target className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium">Realign</span>
                </button>
                <button
                  onClick={handleReturnToSelfClick}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <Compass className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium">Feeling Off</span>
                </button>
              </div>
              
              {/* Capture row */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleQuickCapture("paste")}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium">Paste</span>
                </button>
                <button
                  onClick={() => {
                    handleQuickCapture("insight");
                    setTimeout(() => toggleRecording(), 100);
                  }}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <Mic className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium">Voice</span>
                </button>
              </div>

              {/* Type insight as smaller option */}
              <button
                onClick={() => handleQuickCapture("insight")}
                className="w-full flex items-center justify-center gap-2 p-2 text-xs text-muted-foreground hover:text-foreground transition-all"
              >
                <Lightbulb className="h-3.5 w-3.5" />
                Type an insight
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

      <RealignDialog
        open={showRealign}
        onOpenChange={setShowRealign}
        data={realignData}
        isLoading={isLoadingRealign}
      />
    </>
  );
};
