import { useState } from "react";
import { Plus, X, Lightbulb, Link, FileText, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";

type CaptureType = "insight" | "link" | "note" | null;

export const QuickCapture = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [captureType, setCaptureType] = useState<CaptureType>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

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

  const handleSubmit = async () => {
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
      } else if (captureType === "note") {
        // Quick note goes to insights
        await supabase.from("insights").insert({
          user_id: user.id,
          title: title || "Quick Note",
          content: content,
          source: "quick_capture",
        });
        toast.success("Note saved");
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

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center justify-center"
        aria-label="Quick capture"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Capture Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              {captureType ? (
                <button onClick={() => setCaptureType(null)} className="text-muted-foreground hover:text-foreground">
                  ← Back
                </button>
              ) : (
                "Quick Capture"
              )}
              <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>

          {!captureType ? (
            <div className="grid grid-cols-2 gap-3 py-4">
              <button
                onClick={() => handleQuickCapture("insight")}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all"
              >
                <Lightbulb className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium">Insight</span>
                <span className="text-xs text-muted-foreground">Thought or learning</span>
              </button>
              
              <button
                onClick={() => handleQuickCapture("link")}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all"
              >
                <Link className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium">Link</span>
                <span className="text-xs text-muted-foreground">YouTube, article, etc</span>
              </button>
              
              <button
                onClick={() => handleQuickCapture("note")}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all"
              >
                <FileText className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium">Note</span>
                <span className="text-xs text-muted-foreground">Quick thought</span>
              </button>
              
              <button
                disabled
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border opacity-50 cursor-not-allowed"
              >
                <Mic className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Voice</span>
                <span className="text-xs text-muted-foreground">Coming soon</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {captureType !== "link" && (
                <Input
                  placeholder="Title (optional)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              )}
              
              <Textarea
                placeholder={
                  captureType === "link"
                    ? "Paste YouTube URL or any link..."
                    : captureType === "insight"
                    ? "What did you learn or realize?"
                    : "What's on your mind?"
                }
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[120px]"
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
                className="w-full"
              >
                {isSubmitting ? "Saving..." : "Capture"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
