import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Compass, User } from "lucide-react";
import { z } from "zod";

const identitySeedSchema = z.object({
  content: z.string().trim().min(1, "Identity seed content is required").max(50000, "Content must be less than 50,000 characters"),
});

export default function IdentitySeed() {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [currentReality, setCurrentReality] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [identitySeedId, setIdentitySeedId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchIdentitySeed();
    }
  }, [user]);

  const fetchIdentitySeed = async () => {
    setInitialLoading(true);
    try {
      const { data, error } = await supabase
        .from("identity_seeds")
        .select("*")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching identity seed:", error);
        return;
      }

      if (data) {
        setContent(data.content || "");
        setIdentitySeedId(data.id);
        // Use weekly_focus as current_reality storage
        setCurrentReality(data.weekly_focus || "");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSave = async () => {
    const validation = identitySeedSchema.safeParse({ content });
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast.error(firstError.message);
      return;
    }

    setSaving(true);
    try {
      const updateData = {
        content: validation.data.content,
        weekly_focus: currentReality || null,
        current_phase: "baseline",
      };

      if (identitySeedId) {
        const { error } = await supabase
          .from("identity_seeds")
          .update(updateData)
          .eq("id", identitySeedId);

        if (error) throw error;
        toast.success("Saved");
      } else {
        const { data, error } = await supabase
          .from("identity_seeds")
          .insert({ user_id: user?.id, ...updateData })
          .select()
          .single();

        if (error) throw error;
        setIdentitySeedId(data.id);
        toast.success("Identity created");
      }
    } catch (error) {
      console.error("Error saving identity seed:", error);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Compass className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Identity</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Who you are becoming and where you are now.
        </p>
      </div>

      <div className="space-y-6">
        {/* Current Reality */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-muted-foreground">Current Reality</h2>
          </div>
          <Textarea
            value={currentReality}
            onChange={(e) => setCurrentReality(e.target.value)}
            placeholder="Describe your current situation in plain language. Where are you at? What's your focus right now? What constraints are you working with? The system will understand and adapt."
            className="min-h-[120px] text-sm leading-relaxed resize-none border-0 bg-muted/30 focus-visible:ring-1"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Just write naturally. The system extracts what it needs.
          </p>
        </Card>

        {/* Identity Seed Content */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Compass className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-muted-foreground">Who You Are Becoming</h2>
          </div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="I am becoming someone who... (describe your values, future self, what drives you)"
            className="min-h-[200px] text-sm leading-relaxed resize-none border-0 bg-muted/30 focus-visible:ring-1"
          />
          <p className="text-xs text-muted-foreground mt-2">
            This guides your experiments, daily actions, and recommendations.
          </p>
        </Card>

        <Button
          onClick={handleSave}
          disabled={saving || initialLoading}
          className="w-full"
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}