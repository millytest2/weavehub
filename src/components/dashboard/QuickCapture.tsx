import { useState } from "react";
import { Plus, Lightbulb, Scale, Compass, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";
import { detectCareerKeywords } from "@/lib/careerDetection";
import { CareerRedirectPrompt } from "@/components/CareerRedirectPrompt";
import { DecisionMirrorResponse } from "./DecisionMirrorResponse";
import { ReturnToSelfDialog } from "./ReturnToSelfDialog";

type CaptureType = "paste" | "insight" | "decision" | null;

interface ReturnToSelfData {
  identity: string;
  values: string;
  currentReality: string;
  relevantInsight: { title: string; content: string } | null;
  gentleRep: string;
  reminder: string;
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
  const [showMirrorResponse, setShowMirrorResponse] = useState(false);
  const [mirrorText, setMirrorText] = useState("");
  const [showReturnToSelf, setShowReturnToSelf] = useState(false);
  const [returnToSelfData, setReturnToSelfData] = useState<ReturnToSelfData | null>(null);
  const [isLoadingReturnToSelf, setIsLoadingReturnToSelf] = useState(false);

  const handleOpen = () => setIsOpen(true);
  
  const handleClose = () => {
    setIsOpen(false);
    setCaptureType(null);
    setContent("");
    setTitle("");
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

  const showCareerToast = (textToCheck: string) => {
    if (detectCareerKeywords(textToCheck)) {
      setTimeout(() => {
        toast("Career clarity on your mind?", {
          description: "UPath is designed specifically for this. Weave is for daily alignment, UPath is for finding your path.",
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
        // Smart ingest - auto-detect and process any URL
        setIsProcessing(true);
        toast.info("Processing...");
        
        const { data, error } = await supabase.functions.invoke("smart-ingest", {
          body: { input: content },
        });
        
        if (error) throw error;
        
        toast.success(data.message || "Saved");
        
        // Check for career keywords in pasted content
        showCareerToast(content);
      } else if (captureType === "insight") {
        // Process through brain for categorization
        setIsProcessing(true);
        const processed = await processWithBrain(content);
        
        await supabase.from("insights").insert({
          user_id: user.id,
          title: title || "Quick Insight",
          content: processed,
          source: "quick_capture",
        });
        toast.success("Insight captured");
        
        // Check for career keywords
        showCareerToast(`${title} ${content}`);
      } else if (captureType === "decision") {
        // Call decision-mirror edge function
        setIsProcessing(true);
        const { data, error } = await supabase.functions.invoke("decision-mirror", {
          body: { decision: content },
        });
        
        if (error) throw error;
        
        setMirrorText(data.mirror);
        setShowMirrorResponse(true);
        setIsSubmitting(false);
        setIsProcessing(false);
        
        // Check for career keywords in decision
        showCareerToast(content);
        return;
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
    
    // Check for career-related keywords (skip for paste type)
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

  const handleReturnToSelf = async () => {
    setIsLoadingReturnToSelf(true);
    setShowReturnToSelf(true);
    setIsOpen(false);
    
    try {
      const { data, error } = await supabase.functions.invoke("return-to-self");
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

          {!captureType ? (
            <div className="space-y-3 py-3">
              {/* Return to Self - Primary */}
              <button
                onClick={handleReturnToSelf}
                className="w-full flex items-center gap-3 p-4 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all text-left"
              >
                <Compass className="h-6 w-6 text-primary shrink-0" />
                <div>
                  <span className="text-sm font-medium block">Return to Self</span>
                  <span className="text-xs text-muted-foreground">Drifting? Ground yourself here.</span>
                </div>
              </button>

              {/* Smart Paste - Primary capture method */}
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

              {/* Other capture options */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleQuickCapture("insight")}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <Lightbulb className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium">Manual Insight</span>
                </button>
                
                <button
                  onClick={() => handleQuickCapture("decision")}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <Scale className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium">Decision Mirror</span>
                </button>
              </div>
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
              
              <Textarea
                placeholder={
                  captureType === "paste"
                    ? "Paste any URL (YouTube, article, tweet, Instagram...)"
                    : captureType === "decision"
                    ? "What are you about to do?"
                    : "What did you learn or realize?"
                }
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[100px] sm:min-h-[120px] text-base"
                style={{ fontSize: '16px' }}
                autoFocus
              />
              
              {isProcessing && (
                <p className="text-xs text-muted-foreground animate-pulse">
                  {captureType === "paste" ? "Detecting content and extracting..." : "Processing with AI..."}
                </p>
              )}
              
              <Button
                onClick={handleSubmit}
                disabled={!content.trim() || isSubmitting}
                className="w-full h-10"
              >
                {isSubmitting 
                  ? (captureType === "decision" ? "Reflecting..." : "Processing...") 
                  : (captureType === "decision" ? "Mirror" : captureType === "paste" ? "Save & Extract" : "Capture")
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

      <DecisionMirrorResponse
        open={showMirrorResponse}
        onOpenChange={(open) => {
          setShowMirrorResponse(open);
          if (!open) {
            handleClose();
          }
        }}
        mirror={mirrorText}
      />

      <ReturnToSelfDialog
        open={showReturnToSelf}
        onOpenChange={setShowReturnToSelf}
        data={returnToSelfData}
        isLoading={isLoadingReturnToSelf}
      />
    </>
  );
};
