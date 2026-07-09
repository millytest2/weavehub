import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Compass, User, Star, Target, Mic, MicOff, Layers, Sparkles, History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { z } from "zod";
import { useVoiceCaptureWebSpeech } from "@/hooks/useVoiceCaptureWebSpeech";

const identitySeedSchema = z.object({
  content: z.string().trim().min(1, "Identity seed content is required").max(50000, "Content must be less than 50,000 characters"),
});

type ActiveField = "currentReality" | "coreValues" | "yearNote" | "content" | "lifeDomains" | "throughLine" | null;

export default function IdentitySeed() {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [currentReality, setCurrentReality] = useState("");
  const [previousReality, setPreviousReality] = useState("");
  const [realityUpdatedAt, setRealityUpdatedAt] = useState<string | null>(null);
  const [showPrevious, setShowPrevious] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [coreValues, setCoreValues] = useState("");
  const [yearNote, setYearNote] = useState("");
  const [lifeDomains, setLifeDomains] = useState("");
  const [throughLine, setThroughLine] = useState("");
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
        case "lifeDomains": setLifeDomains(append); break;
        case "throughLine": setThroughLine(append); break;
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
    setLifeDomains("");
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
        setPreviousReality((data as any).previous_reality || "");
        setRealityUpdatedAt((data as any).reality_updated_at || null);
        setCoreValues(data.core_values || "");
        setYearNote(data.year_note || "");
        setLifeDomains((data as any).life_domains || "");
      } else {
        setContent("");
        setCurrentReality("");
        setPreviousReality("");
        setRealityUpdatedAt(null);
        setCoreValues("");
        setYearNote("");
        setLifeDomains("");
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
        life_domains: lifeDomains || null,
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

  const handleAutoRefresh = async () => {
    if (!user?.id) return;
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("refresh-current-reality", {
        body: { current_reality: currentReality },
      });
      if (error) throw error;
      const next = (data as any)?.current_reality?.trim();
      if (!next) {
        toast.info("Nothing new to weave in yet.");
        return;
      }
      setCurrentReality(next);
      toast.success("Refreshed from your latest captures. Review and save.");
    } catch (e: any) {
      console.error(e);
      toast.error("Couldn't refresh right now.");
    } finally {
      setRefreshing(false);
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
              {realityUpdatedAt && (
                <span className="text-[10px] text-muted-foreground/60">
                  · updated {formatDistanceToNow(new Date(realityUpdatedAt), { addSuffix: true })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAutoRefresh}
                disabled={refreshing}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                title="Weave in your latest captures"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1" />
                {refreshing ? "Weaving..." : "Auto-refresh"}
              </Button>
              <VoiceButton field="currentReality" />
            </div>
          </div>
          <Textarea
            value={currentReality}
            onChange={(e) => setCurrentReality(e.target.value)}
            placeholder="Where are you at right now? What's your situation? Just talk naturally — type or hit the mic."
            className="min-h-[120px] text-sm leading-relaxed resize-none border-0 bg-muted/30 focus-visible:ring-1"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Auto-refresh pulls your last 14 days of captures and rewrites this. Prior version is preserved below.
          </p>
          <p className="text-[10px] text-muted-foreground/40 mt-1 italic">
            → Feeds into: daily invitations, experiment generation, decision mirror
          </p>

          {previousReality && (
            <div className="mt-4 pt-4 border-t border-border/40">
              <button
                type="button"
                onClick={() => setShowPrevious((v) => !v)}
                className="flex items-center gap-2 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                <History className="w-3 h-3" />
                {showPrevious ? "Hide" : "Show"} previous reality
              </button>
              {showPrevious && (
                <div className="mt-2 p-3 rounded-md bg-muted/20 text-xs text-muted-foreground/80 whitespace-pre-wrap leading-relaxed">
                  {previousReality}
                </div>
              )}
            </div>
          )}
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
          <p className="text-[10px] text-muted-foreground/40 mt-1 italic">
            → Grounds: weekly intentions, "why it matters" in every invitation
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
          <p className="text-[10px] text-muted-foreground/40 mt-1 italic">
            → Shapes: Thread roadmap, monthly milestones, experiment themes
          </p>
        </Card>

        {/* Life Landscape - Brain Dump */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-muted-foreground">Life Landscape</h2>
            </div>
            <VoiceButton field="lifeDomains" />
          </div>
          <Textarea
            value={lifeDomains}
            onChange={(e) => setLifeDomains(e.target.value)}
            placeholder="Dump everything you care about: chess, gym, piano, psychology, content creation, building UPath, relationships, poker, spirituality, style, cooking, tennis... Just list it all. The system will naturally rotate across these."
            className="min-h-[140px] text-sm leading-relaxed resize-none border-0 bg-muted/30 focus-visible:ring-1"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Everything you want the system to be aware of. It learns which ones need attention from your behavior over time.
          </p>
          <p className="text-[10px] text-muted-foreground/40 mt-1 italic">
            → Drives: domain rotation in invitations, weekly intention suggestions
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
          <p className="text-[10px] text-muted-foreground/40 mt-1 italic">
            → The core thread: everything in the system aligns with this
          </p>
        </Card>

        <Button
          onClick={handleSave}
          disabled={saving || initialLoading}
          className="w-full"
        >
          {saving ? "Saving..." : "Save"}
        </Button>

        {/* Resource connection — a good read that connects to who you're becoming */}
        <Card className="p-5 bg-muted/20 border-dashed">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-muted-foreground">A read that connects here</h2>
          </div>
          <p className="text-xs text-muted-foreground/70 leading-relaxed mb-3">
            Short, high-signal reads for the lane you're actually in — career direction in the AI era, sales reps, local business visibility, and staying focused when everything is interesting.
          </p>
          <ul className="space-y-2.5 text-[13px]">
            {[
              { t: "How to Do Great Work", a: "Paul Graham", u: "https://paulgraham.com/greatwork.html", why: "Focus, taste, and the courage to stay on one lane." },
              { t: "Life is Short", a: "Paul Graham", u: "https://paulgraham.com/vb.html", why: "Cut what doesn't matter. Compound what does." },
              { t: "Specific Knowledge", a: "Naval", u: "https://nav.al/specific-knowledge", why: "Your edge is the intersection nobody else has — build for it." },
              { t: "The Ultimate Guide to Writing Online", a: "David Perell", u: "https://perell.com/essay/the-ultimate-guide-to-writing-online/", why: "Turn what you're already doing into founder-led proof." },
              { t: "$100M Offers", a: "Alex Hormozi", u: "https://www.acquisition.com/hormozi-offers", why: "Offer construction for Social Hog / Built for Main Street." },
              { t: "Do Things That Don't Scale", a: "Paul Graham", u: "https://paulgraham.com/ds.html", why: "How UPath's first 8–10 real career reads should happen." },
              { t: "A Founder's Guide to Writing Well", a: "Julian Shapiro", u: "https://www.julian.com/guide/write/intro", why: "Sharper messaging for LinkedIn / Substack / UPath." },
              { t: "Good Work", a: "Henrik Karlsson", u: "https://www.henrikkarlsson.xyz/p/good-work", why: "Protecting the through-line when you have many interests." },
            ].map((r, i) => (
              <li key={i} className="leading-snug">
                <a href={r.u} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                  {r.t}
                </a>
                <span className="text-muted-foreground/60"> — {r.a}</span>
                <p className="text-[11px] text-muted-foreground/50 mt-0.5">{r.why}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}