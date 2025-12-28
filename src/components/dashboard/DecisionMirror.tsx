import { useState } from "react";
import { Scale, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";
import { detectCareerKeywords } from "@/lib/careerDetection";
import { CareerRedirectPrompt } from "@/components/CareerRedirectPrompt";
import { DecisionMirrorResponse } from "./DecisionMirrorResponse";

export const DecisionMirror = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCareerPrompt, setShowCareerPrompt] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [showMirrorResponse, setShowMirrorResponse] = useState(false);
  const [mirrorText, setMirrorText] = useState("");

  const handleClose = () => {
    setIsOpen(false);
    setContent("");
  };

  const executeSubmit = async () => {
    if (!user || !content.trim()) return;
    
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("decision-mirror", {
        body: { decision: content },
      });
      
      if (error) throw error;
      
      setMirrorText(data.mirror);
      setShowMirrorResponse(true);
      setIsOpen(false);
    } catch (error: any) {
      console.error("Decision mirror error:", error);
      toast.error(error.message || "Failed to reflect");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (!user || !content.trim()) return;
    
    if (detectCareerKeywords(content)) {
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
      {/* Floating Decision Mirror Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 md:bottom-6 right-[5.5rem] z-50 w-10 h-10 rounded-full bg-muted/80 backdrop-blur text-muted-foreground border border-border shadow-md hover:shadow-lg hover:bg-muted hover:text-foreground transition-all flex items-center justify-center"
        aria-label="Decision mirror"
      >
        <Scale className="h-4 w-4" />
      </button>

      {/* Decision Mirror Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md mx-auto rounded-xl p-4 sm:p-6">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base sm:text-lg flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              Decision Mirror
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Reflect on a decision through your values
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3">
            <Textarea
              placeholder="What are you about to do?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[120px] text-base"
              style={{ fontSize: '16px' }}
              autoFocus
            />
            
            <Button
              onClick={handleSubmit}
              disabled={!content.trim() || isSubmitting}
              className="w-full h-10"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Reflecting...
                </>
              ) : (
                "Mirror"
              )}
            </Button>
          </div>
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
            setContent("");
          }
        }}
        mirror={mirrorText}
      />
    </>
  );
};
