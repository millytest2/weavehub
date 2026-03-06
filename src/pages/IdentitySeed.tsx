import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Compass, User, Star, Target, Mic, MicOff } from "lucide-react";
import { z } from "zod";
import { useVoiceCaptureWebSpeech } from "@/hooks/useVoiceCaptureWebSpeech";

const identitySeedSchema = z.object({
  content: z.string().trim().min(1, "Identity seed content is required").max(50000, "Content must be less than 50,000 characters"),
});

type ActiveField = "currentReality" | "coreValues" | "yearNote" | "content" | null;

export default function IdentitySeed() {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [currentReality, setCurrentReality] = useState("");
  const [coreValues, setCoreValues] = useState("");
  const [yearNote, setYearNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [identitySeedId, setIdentitySeedId] = useState<string | null>(null);
  const [activeVoiceField, setActiveVoiceField] = useState<ActiveField>(null);

  const { isRecording, startRecording, stopRecording } = useVoiceCaptureWebSpeech({
    onTranscript: (text) => {
      if (!activeVoiceField) return;
      const append = (prev: string) => prev ? `${prev} ${text}` : text;
      switch (activeVoiceField) {
        case "currentReality": setCurrentReality(append); break;
        case "coreValues": setCoreValues(append); break;
        case "yearNote": setYearNote(append); break;
        case "content": setContent(append); break;
      }
    },
    onError: (error) => {
      toast.error(error);
      setActiveVoiceField(null);
    },
    maxDuration: 120,
  });

  const toggleVoice = (field: ActiveField) => {
    if (isRecording && activeVoiceField === field) {
      stopRecording();
      setActiveVoiceField(null);
    } else {
      if (isRecording) stopRecording();
      setActiveVoiceField(field);
      startRecording();
    }
  };

  useEffect(() => {
    setContent("");
    setCurrentReality("");
    setCoreValues("");
    setYearNote("");
    setIdentitySeedId(null);
    
    if (user) {
      fetchIdentitySeed();
    }
  }, [user?.id]);

  const fetchIdentitySeed = async () => {
    if (!user?.id) return;
    
    setInitialLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setInitialLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("identity_seeds")
        .select("*")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching identity seed:", error);
        return;
      }

      if (data) {
        setContent(data.content || "");
        setIdentitySeedId(data.id);
        setCurrentReality(data.weekly_focus || "");
        setCoreValues(data.core_values || "");
        setYearNote(data.year_note || "");
      } else {
        setContent("");
        setCurrentReality("");
        setCoreValues("");
        setYearNote("");
        setIdentitySeedId(null);
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
        core_values: coreValues || null,
        year_note: yearNote || null,
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

  const VoiceButton = ({ field }: { field: ActiveField }) => {
    const isActive = isRecording && activeVoiceField === field;
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => toggleVoice(field)}
        className={`h-7 w-7 p-0 ${isActive ? "text-destructive animate-pulse" : "text-muted-foreground hover:text-foreground"}`}
      >
        {isActive ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
      </Button>
    );
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Identity</h1>
        <p className="text-muted-foreground text-sm">
          Who you are becoming and where you are now. Type or use voice to fill in.
        </p>
      </div>

      <div className="space-y-6">
        {/* Current Reality */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-muted-foreground">Current Reality</h2>
            </div>
            <VoiceButton field="currentReality" />
          </div>
          <Textarea
            value={currentReality}
            onChange={(e) => setCurrentReality(e.target.value)}
            placeholder="Where are you at right now? What's your situation? Just talk naturally — type or hit the mic."
            className="min-h-[120px] text-sm leading-relaxed resize-none border-0 bg-muted/30 focus-visible:ring-1"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Just write or speak naturally. The system extracts what it needs.
          </p>
        </Card>

        {/* Core Values */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-muted-foreground">Core Values</h2>
            </div>
            <VoiceButton field="coreValues" />
          </div>
          <Textarea
            value={coreValues}
            onChange={(e) => setCoreValues(e.target.value)}
            placeholder="What do you stand for? (e.g. Freedom, Growth, Health, Creation, Impact)"
            className="min-h-[100px] text-sm leading-relaxed resize-none border-0 bg-muted/30 focus-visible:ring-1"
          />
          <p className="text-xs text-muted-foreground mt-2">
            3-5 values that define how you want to live.
          </p>
        </Card>

        {/* Year Direction */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-muted-foreground">2026 Direction</h2>
            </div>
            <VoiceButton field="yearNote" />
          </div>
          <Textarea
            value={yearNote}
            onChange={(e) => setYearNote(e.target.value)}
            placeholder="What's your focus this year? Key goals, themes, milestones? (e.g. Hit $100K revenue, move to LA, launch product, body transformation)"
            className="min-h-[120px] text-sm leading-relaxed resize-none border-0 bg-muted/30 focus-visible:ring-1"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Experiments and daily actions will align with this direction.
          </p>
        </Card>

        {/* Identity Seed Content */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-muted-foreground">Who You Are Becoming</h2>
            </div>
            <VoiceButton field="content" />
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