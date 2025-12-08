import { useState } from "react";
import { Plus, Lightbulb, Link, Scale } from "lucide-react";
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

type CaptureType = "insight" | "link" | "decision" | null;

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

  const executeSubmit = async () => {
    if (!user || !content.trim()) return;
    
    setIsSubmitting(true);
    try {
      if (captureType === "link") {
        // Check if it's a YouTube link
        const isYouTube = content.includes("youtube.com") || content.includes("youtu.be");
        
        if (isYouTube) {
          setIsProcessing(true);
          toast.info("Processing YouTube video...");
          
          const { data, error } = await supabase.functions.invoke("youtube-processor", {
            body: { url: content },
          });
          
          if (error) throw error;
          
          // Save as document with summary
          await supabase.from("documents").insert({
            user_id: user.id,
            title: data.title || "YouTube Video",
            summary: data.summary,
            file_type: "youtube",
          });
          
          toast.success("Video processed & saved");
        } else {
          // Save as regular document link
          await supabase.from("documents").insert({
            user_id: user.id,
            title: title || "Captured Link",
            summary: content,
            file_type: "link",
          });
          toast.success("Link saved");
        }
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
      } else if (captureType === "decision") {
        // Call decision-mirror edge function
        setIsProcessing(true);
        const { data, error } = await supabase.functions.invoke("decision-mirror", {
          body: { decision: content },
        });
        
        if (error) throw error;
        
        setMirrorText(data.mirror);
        setShowMirrorResponse(true);
        // Don't close main dialog yet - wait for mirror response to be closed
        setIsSubmitting(false);
        setIsProcessing(false);
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
    
    // Check for career-related keywords
    const textToCheck = `${title} ${content}`;
    if (detectCareerKeywords(textToCheck)) {
      setPendingSubmit(true);
      setShowCareerPrompt(true);
      return;
    }
    
    executeSubmit();
  };

  const handleCareerPromptContinue = () => {
    setPendingSubmit(false);
    executeSubmit();
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
                "Quick Capture"
              )}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">Capture thoughts, links, or decisions</DialogDescription>
          </DialogHeader>

          {!captureType ? (
            <div className="grid grid-cols-3 gap-2 sm:gap-3 py-3">
              <button
                onClick={() => handleQuickCapture("insight")}
                className="flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all"
              >
                <Lightbulb className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                <span className="text-xs sm:text-sm font-medium">Insight</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground text-center">Thought or learning</span>
              </button>
              
              <button
                onClick={() => handleQuickCapture("link")}
                className="flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all"
              >
                <Link className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                <span className="text-xs sm:text-sm font-medium">Link</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground text-center">YouTube, article</span>
              </button>
              
              <button
                onClick={() => handleQuickCapture("decision")}
                className="flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all"
              >
                <Scale className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                <span className="text-xs sm:text-sm font-medium">Decision</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground text-center">Mirror identity</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3 py-3">
              {captureType !== "link" && (
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
                  captureType === "link"
                    ? "Paste YouTube URL or any link..."
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
                  Processing with AI...
                </p>
              )}
              
              <Button
                onClick={handleSubmit}
                disabled={!content.trim() || isSubmitting}
                className="w-full h-10"
              >
                {isSubmitting ? (captureType === "decision" ? "Reflecting..." : "Saving...") : (captureType === "decision" ? "Mirror" : "Capture")}
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
            // User closed without choosing, reset
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
    </>
  );
};
