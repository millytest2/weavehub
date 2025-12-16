import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";

interface ManualPasteFallbackProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string | null;
  contentType: string;
  onComplete: () => void;
}

export function ManualPasteFallback({ 
  open, 
  onOpenChange, 
  documentId, 
  contentType,
  onComplete 
}: ManualPasteFallbackProps) {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user || !content.trim() || !documentId) return;
    
    setIsSubmitting(true);
    try {
      // Update the document with the manual content
      const { error: updateError } = await supabase
        .from("documents")
        .update({ extracted_content: content })
        .eq("id", documentId);
      
      if (updateError) throw updateError;

      // Generate insights from the content
      const LOVABLE_API_KEY = import.meta.env.VITE_LOVABLE_API_KEY;
      
      // Call the edge function to generate insights
      const { data, error } = await supabase.functions.invoke("brain", {
        body: { 
          input: content,
          task: "extract_insights"
        },
      });

      if (!error && data?.insights) {
        // Save generated insights
        for (const insight of data.insights.slice(0, 3)) {
          await supabase.from("insights").insert({
            user_id: user.id,
            title: insight.title || "Insight",
            content: insight.content,
            source: `${contentType}:manual`,
          });
        }
        toast.success(`Content saved + ${data.insights.length} insights extracted`);
      } else {
        // Save as single insight if AI fails
        await supabase.from("insights").insert({
          user_id: user.id,
          title: `${contentType === 'instagram' ? 'Instagram' : 'Twitter'} Capture`,
          content: content.substring(0, 2000),
          source: `${contentType}:manual`,
        });
        toast.success("Content saved as insight");
      }

      setContent("");
      onOpenChange(false);
      onComplete();
    } catch (error: any) {
      console.error("Manual paste error:", error);
      toast.error("Failed to save content");
    } finally {
      setIsSubmitting(false);
    }
  };

  const platformName = contentType === 'instagram' ? 'Instagram' : 'Twitter/X';
  const placeholder = contentType === 'instagram' 
    ? "Paste the caption text here..."
    : "Paste the full tweet/thread text here...";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md mx-auto rounded-xl p-4 sm:p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base sm:text-lg">
            Add {platformName} Content
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            We saved the link but couldn't extract the full content. Paste it below for better insights.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-3">
          <Textarea
            placeholder={placeholder}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[150px] text-base"
            style={{ fontSize: '16px' }}
            autoFocus
          />
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onComplete();
              }}
              className="flex-1"
            >
              Skip
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!content.trim() || isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? "Saving..." : "Save & Extract"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
