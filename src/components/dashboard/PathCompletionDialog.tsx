import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Trophy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PathCompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathId: string;
  topicName: string;
  durationDays: number;
  subTopics: string[];
  finalDeliverable: string | null;
  sourcesUsed: { id: string; title: string; type: string }[];
  onComplete: (insightId: string) => void;
}

export const PathCompletionDialog = ({
  open,
  onOpenChange,
  pathId,
  topicName,
  durationDays,
  subTopics,
  finalDeliverable,
  sourcesUsed,
  onComplete,
}: PathCompletionDialogProps) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [principle, setPrinciple] = useState("");
  const [mentalModel, setMentalModel] = useState("");
  const [identityUpgrade, setIdentityUpgrade] = useState("");

  const handleSave = async () => {
    if (!user) return;
    if (!principle.trim() || !mentalModel.trim() || !identityUpgrade.trim()) {
      toast.error("Please fill in all three fields");
      return;
    }

    setSaving(true);

    try {
      // Build the insight content
      const sourcesList = sourcesUsed.map((s, i) => `[${i + 1}] ${s.title}`).join("\n");
      const subTopicsList = subTopics.join(", ");

      const content = `## Path Completed: ${topicName}
Duration: ${durationDays} days
Sub-topics mastered: ${subTopicsList}
${finalDeliverable ? `Final deliverable: ${finalDeliverable}` : ""}

### Principle
${principle.trim()}

### Mental Model
${mentalModel.trim()}

### Identity Upgrade
${identityUpgrade.trim()}

---
Sources used:
${sourcesList}`;

      // Create the insight
      const { data: insight, error: insightError } = await supabase
        .from("insights")
        .insert({
          user_id: user.id,
          title: `${topicName} - Learning Path Complete`,
          content,
          source: "learning_path",
        })
        .select("id")
        .single();

      if (insightError) throw insightError;

      // Mark path as completed
      const { error: pathError } = await supabase
        .from("learning_paths")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", pathId);

      if (pathError) throw pathError;

      toast.success("Learnings codified and saved");
      onComplete(insight.id);
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving completion:", error);
      toast.error("Failed to save learnings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            <DialogTitle>Codify Your Learnings</DialogTitle>
          </div>
          <DialogDescription>
            You completed {durationDays} days of {topicName}. Lock in what you learned.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="principle">One principle to keep</Label>
            <Textarea
              id="principle"
              placeholder="What core truth will you carry forward?"
              value={principle}
              onChange={(e) => setPrinciple(e.target.value)}
              className="min-h-[80px] resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mental-model">One mental model</Label>
            <Textarea
              id="mental-model"
              placeholder="What framework for thinking did you develop?"
              value={mentalModel}
              onChange={(e) => setMentalModel(e.target.value)}
              className="min-h-[80px] resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="identity">One identity upgrade</Label>
            <Textarea
              id="identity"
              placeholder="I AM someone who..."
              value={identityUpgrade}
              onChange={(e) => setIdentityUpgrade(e.target.value)}
              className="min-h-[80px] resize-none"
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : null}
          Lock In Learnings
        </Button>
      </DialogContent>
    </Dialog>
  );
};
