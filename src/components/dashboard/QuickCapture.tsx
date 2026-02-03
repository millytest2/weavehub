import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, Compass, Sparkles, Mic, MicOff, Loader2, Zap, Waves, Target, BookCheck, ChevronUp } from "lucide-react";
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
import { ApplyThisDialog } from "./ApplyThisDialog";
import { Confetti, useConfetti } from "@/components/ui/confetti";

type CaptureType = "paste" | "insight" | null;
type RealignMode = "push" | "flow" | null;

const FEELING_OFF_STATES = [
  { id: "scattered", label: "Scattered", desc: "Need to refocus", spiral: false },
  { id: "drifting", label: "Drifting", desc: "Lost direction", spiral: false },
  { id: "stuck", label: "Stuck", desc: "Can't start", spiral: false },
  { id: "disconnected", label: "Disconnected", desc: "Far from self", spiral: false },
  { id: "overloaded", label: "Overloaded", desc: "Too many inputs", spiral: false },
] as const;

// Spiral states - for when you're IN IT emotionally
const SPIRAL_STATES = [
  { id: "anxious", label: "Anxious", desc: "Chest tight, racing thoughts" },
  { id: "comparing", label: "Comparing", desc: "Everyone else is ahead" },
  { id: "people-pleasing", label: "People Pleasing", desc: "Losing myself to others" },
  { id: "shrinking", label: "Shrinking", desc: "Playing small, scared" },
  { id: "spending", label: "Spending to Fill", desc: "Buying to feel something" },
  { id: "waiting", label: "Waiting", desc: "Not hustling, waiting for it" },
] as const;

type EmotionalState = typeof FEELING_OFF_STATES[number]["id"] | typeof SPIRAL_STATES[number]["id"] | null;

interface ReturnToSelfData {
  bodyFirst: string;
  yourWords: string;
  yourWordsSource: string;
  whatIsHappening: string;
  whoYouAre: string;
  oneMove: string;
  truthYouKnow: string;
  isSpiral: boolean;
  emotionalState: string | null;
  logId: string | null;
}

export const QuickCapture = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [captureType, setCaptureType] = useState<CaptureType>("paste"); // Default to paste
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCareerPrompt, setShowCareerPrompt] = useState(false);
  const [isFirstPaste, setIsFirstPaste] = useState(false);
  const { showConfetti, celebrate, handleComplete: handleConfettiComplete } = useConfetti();

  // Check if this is user's first paste
  useEffect(() => {
    const checkFirstPaste = async () => {
      if (!user) return;
      const hasSeenConfetti = localStorage.getItem(`first_paste_${user.id}`);
      if (!hasSeenConfetti) {
        setIsFirstPaste(true);
      }
    };
    checkFirstPaste();
  }, [user]);
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
  const [showApplyThis, setShowApplyThis] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  
  const { isRecording, isTranscribing, toggleRecording } = useVoiceCapture({
    onTranscript: (text) => {
      setContent(prev => prev ? `${prev}\n${text}` : text);
      toast.success("Voice captured");
    },
  });

  const handleOpen = () => {
    setIsOpen(true);
    setCaptureType("paste"); // Always open to paste
    setShowMoreActions(false);
  };
  
  const handleClose = () => {
    setIsOpen(false);
    setCaptureType("paste");
    setContent("");
    setTitle("");
    setShowEmotionalPicker(false);
    setShowRealignPicker(false);
    setShowMoreActions(false);
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

  // State for showing connections after paste
  const [showConnections, setShowConnections] = useState(false);
  const [captureResult, setCaptureResult] = useState<{
    title: string;
    connections: { id: string; title: string; similarity: number }[];
    synthesis: string;
    capability: string;
  } | null>(null);

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
        
        // Show connections if we found any
        if (data.connections && data.connections.length > 0) {
          setCaptureResult({
            title: data.title || "Captured content",
            connections: data.connections,
            synthesis: data.synthesis || "",
            capability: data.capability || "",
          });
          setShowConnections(true);
          setContent("");
          toast.success(`Woven with ${data.connections.length} existing insight${data.connections.length > 1 ? 's' : ''}`);
        } else {
          // First paste celebration!
          if (isFirstPaste && user) {
            celebrate();
            localStorage.setItem(`first_paste_${user.id}`, "true");
            setIsFirstPaste(false);
            toast.success("First capture! You're weaving. 🎉");
          } else {
            toast.success(data.message || "Saved");
          }
          handleClose();
        }
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
        handleClose();
      }
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
        bodyFirst: "Three breaths. Slow.",
        yourWords: "",
        yourWordsSource: "",
        whatIsHappening: "You're off-center. That's all.",
        whoYouAre: "",
        oneMove: "Move your body for 5 minutes.",
        truthYouKnow: "You already know what to do.",
        isSpiral: false,
        emotionalState: null,
        logId: null
      });
    } finally {
      setIsLoadingReturnToSelf(false);
    }
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

  // Secondary action buttons
  const SecondaryActions = () => (
    <div className="flex items-center justify-center gap-1 pt-2 border-t border-border/50">
      <button
        onClick={() => { setShowRealignPicker(true); setShowMoreActions(false); }}
        className="flex flex-col items-center gap-0.5 p-2 rounded-lg hover:bg-primary/5 transition-all group"
        title="Realign"
      >
        <Target className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        <span className="text-[10px] text-muted-foreground group-hover:text-primary">Realign</span>
      </button>
      <button
        onClick={() => { setShowEmotionalPicker(true); setShowMoreActions(false); }}
        className="flex flex-col items-center gap-0.5 p-2 rounded-lg hover:bg-primary/5 transition-all group"
        title="Feeling Off"
      >
        <Compass className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        <span className="text-[10px] text-muted-foreground group-hover:text-primary">Ground</span>
      </button>
      <button
        onClick={() => { setCaptureType("insight"); setShowMoreActions(false); }}
        className="flex flex-col items-center gap-0.5 p-2 rounded-lg hover:bg-primary/5 transition-all group"
        title="Insight"
      >
        <Lightbulb className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        <span className="text-[10px] text-muted-foreground group-hover:text-primary">Insight</span>
      </button>
      <button
        onClick={() => { setIsOpen(false); setShowApplyThis(true); }}
        className="flex flex-col items-center gap-0.5 p-2 rounded-lg hover:bg-primary/5 transition-all group"
        title="Apply"
      >
        <BookCheck className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        <span className="text-[10px] text-muted-foreground group-hover:text-primary">Apply</span>
      </button>
    </div>
  );

  return (
    <>
      {/* Floating Action Button */}
      <motion.button
        onClick={handleOpen}
        className="fixed bottom-20 md:bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
        aria-label="Weave"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.1, boxShadow: "0 20px 40px -10px hsl(var(--primary) / 0.4)" }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
      >
        <Sparkles className="h-5 w-5" />
      </motion.button>

      {/* Main Dialog - Paste First */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm mx-auto rounded-xl p-4">
          <DialogHeader className="pb-1">
            <DialogTitle className="text-base">
              {showRealignPicker || showEmotionalPicker ? (
                <button 
                  onClick={() => { setShowRealignPicker(false); setShowEmotionalPicker(false); }} 
                  className="text-muted-foreground hover:text-foreground text-sm"
                >
                  ← Back
                </button>
              ) : captureType === "insight" ? (
                <button onClick={() => setCaptureType("paste")} className="text-muted-foreground hover:text-foreground text-sm">
                  ← Back to Paste
                </button>
              ) : (
                "Paste anything"
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">Quick capture</DialogDescription>
          </DialogHeader>

          {showRealignPicker ? (
            <div className="space-y-3 py-3">
              <p className="text-xs text-muted-foreground text-center mb-2">Choose your mode</p>
              <button
                onClick={() => handleRealign("push")}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-transparent bg-gradient-to-r from-amber-500/10 to-orange-500/10 hover:border-orange-500/40 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
                  <Zap className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-semibold block">Push</span>
                  <span className="text-xs text-muted-foreground">Show me the gap</span>
                </div>
              </button>
              <button
                onClick={() => handleRealign("flow")}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-transparent bg-gradient-to-r from-blue-500/10 to-cyan-500/10 hover:border-blue-500/40 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shrink-0">
                  <Waves className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-semibold block">Flow</span>
                  <span className="text-xs text-muted-foreground">Ground me in what matters</span>
                </div>
              </button>
            </div>
          ) : showEmotionalPicker ? (
            <div className="space-y-4 py-3">
              {/* Spiral States - for when you're IN IT */}
              <div>
                <p className="text-xs text-destructive/80 font-medium mb-2">I'm spiraling</p>
                <div className="grid grid-cols-2 gap-2">
                  {SPIRAL_STATES.map((state) => (
                    <button
                      key={state.id}
                      onClick={() => handleReturnToSelfWithState(state.id)}
                      className="flex flex-col items-start p-3 rounded-xl border border-destructive/30 bg-destructive/5 hover:border-destructive/50 hover:bg-destructive/10 transition-all text-left"
                    >
                      <span className="text-sm font-medium">{state.label}</span>
                      <span className="text-xs text-muted-foreground">{state.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Off-center States - lighter */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Just off-center</p>
                <div className="grid grid-cols-2 gap-2">
                  {FEELING_OFF_STATES.map((state) => (
                    <button
                      key={state.id}
                      onClick={() => handleReturnToSelfWithState(state.id)}
                      className="flex flex-col items-start p-3 rounded-xl border border-border/60 hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
                    >
                      <span className="text-sm font-medium">{state.label}</span>
                      <span className="text-xs text-muted-foreground">{state.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleReturnToSelfWithState(null)}
                className="w-full p-3 rounded-xl bg-muted/50 text-sm text-muted-foreground hover:text-foreground transition-all"
              >
                Just ground me
              </button>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              {/* Insight mode: show title input */}
              {captureType === "insight" && (
                <Input
                  placeholder="Title (optional)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-10 text-base"
                  style={{ fontSize: '16px' }}
                />
              )}
              
              {/* Main input - always visible */}
              <div className="relative">
                <Textarea
                  placeholder={
                    captureType === "paste"
                      ? "YouTube link, article URL, tweet, or any thought..."
                      : "What did you learn or realize?"
                  }
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[100px] text-base pr-12"
                  style={{ fontSize: '16px' }}
                  autoFocus
                />
                
                {/* Voice button inside textarea */}
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
              </div>
              
              {isRecording && (
                <p className="text-xs text-destructive animate-pulse">Recording... tap mic to stop</p>
              )}
              
              {isTranscribing && (
                <p className="text-xs text-muted-foreground animate-pulse">Transcribing...</p>
              )}
              
              {isProcessing && (
                <p className="text-xs text-muted-foreground animate-pulse">
                  {captureType === "paste" ? "Detecting content and extracting..." : "Processing..."}
                </p>
              )}
              
              <Button
                onClick={handleSubmit}
                disabled={!content.trim() || isSubmitting || isRecording || isTranscribing}
                className="w-full h-10"
              >
                {isSubmitting ? "Processing..." : captureType === "paste" ? "Save & Extract" : "Capture Insight"}
              </Button>

              {/* Secondary actions - collapsed by default */}
              <AnimatePresence>
                {showMoreActions && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <SecondaryActions />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* More actions toggle */}
              <button
                onClick={() => setShowMoreActions(!showMoreActions)}
                className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                <motion.div animate={{ rotate: showMoreActions ? 180 : 0 }}>
                  <ChevronUp className="h-3 w-3" />
                </motion.div>
                {showMoreActions ? "Less" : "More actions"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CareerRedirectPrompt
        open={showCareerPrompt}
        onOpenChange={(open) => {
          setShowCareerPrompt(open);
          if (!open && !pendingSubmit) setPendingSubmit(false);
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

      <ApplyThisDialog
        open={showApplyThis}
        onOpenChange={setShowApplyThis}
      />

      <Confetti show={showConfetti} onComplete={handleConfettiComplete} />
    </>
  );
};
