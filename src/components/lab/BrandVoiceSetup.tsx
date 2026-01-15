import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { 
  Save, 
  Sparkles, 
  User, 
  Lightbulb, 
  Megaphone, 
  Heart,
  X,
  Plus,
  Download
} from "lucide-react";

interface ContentPillar {
  name: string;
  description: string;
}

interface PlatformVoice {
  tone: string;
  style: string;
  examples: string;
}

interface BrandVoiceTemplate {
  id?: string;
  brand_identity: string;
  content_pillars: ContentPillar[];
  platform_voices: {
    tiktok: PlatformVoice;
    youtube: PlatformVoice;
    substack: PlatformVoice;
    twitter: PlatformVoice;
  };
  personality_blend: string;
  values: string[];
  avoid_list: string[];
  vision_summary: string;
}

interface BrandVoiceSetupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const defaultTemplate: BrandVoiceTemplate = {
  brand_identity: `Miles Tipton, 29, Los Angeles/Carpinteria

You're the capable overthinker who spent $3K on 3 career coaches, took 7 personality tests, consumed 100+ hours of advice, and got MORE paralyzed, not less. Then you discovered: experiments > advice. Now you're documenting the proof by living it—building UPath to $100K revenue while gaining 20 pounds, growing to 10K followers, and integrating all life domains instead of choosing between them. You're 6 months ahead in the messy middle, not teaching from the exit. You're the founder-scientist using yourself as the test subject.

Your Expensive Education (What Makes You Credible):
- 3 career coaches failed you (personality assessments, strengths finders, values clarification)
- 7 personality tests increased paralysis (ENFP, Maximizer, Ideation, Strategic, Learner)
- 100+ hours advice consumption made it worse
- $3K+ spent learning what DOESN'T work
- Discovery: 30-day experiments generate more clarity than 100 hours of assessment`,
  content_pillars: [
    { 
      name: "Building UPath in Public", 
      description: "Dogfooding the job search agent on myself while building it. Daily build updates, customer insights, strategic decisions, transparent metrics, co-founder dynamics. Shows messy middle, not polished success." 
    },
    { 
      name: "Identity Expansion Data", 
      description: "150→170 lbs journey + anxiety protocols with real numbers. Documenting nervous system resistance at each threshold. Body regulation techniques. All tracked with quantified data." 
    },
    { 
      name: "Anti-MBA Philosophy", 
      description: "Challenging conventional wisdom with data from my $3K expensive education. Career advice tested, assessment industry critique, productivity myths debunked. Experiments > advice." 
    },
    { 
      name: "The Human Component", 
      description: "Networking, adventures, hobbies, doing things outside comfort zone. Kevin's Rule adventures, drums/chess/golf, real struggle days. Shows I'm human, not a productivity robot." 
    },
  ],
  platform_voices: {
    tiktok: { 
      tone: "Authentic, not polished. Energy > production quality", 
      style: "Talking head 60 sec, screen recordings, B-roll + text overlays", 
      examples: "Hook (text on screen first 3 sec) → Problem/contrarian take → Your data → Result → CTA" 
    },
    youtube: { 
      tone: "Educational, showing work", 
      style: "Monthly deep dives, protocol breakdowns, quarterly integration mega-essays", 
      examples: "Full methodology disclosed, data visualization, researcher frame" 
    },
    substack: { 
      tone: "In-depth, thoughtful, complete methodology disclosed", 
      style: "2000-3000 word essays, replicable frameworks, data visualization", 
      examples: "The 21-Day Anxiety Protocol, The Assessment Trap, Week X updates proving Anti-MBA thesis" 
    },
    twitter: { 
      tone: "Raw, honest, data-driven. No emojis unless necessary", 
      style: "Short sentences, clear thoughts. 'I' not 'you'. Numbers > feelings", 
      examples: "Vulnerability without victimhood. Senior year Miles energy (confident, curious, not hiding)" 
    },
  },
  personality_blend: "Ryan Gosling (calm power), Timothée Chalamet (vulnerable cool), Kevin Hart (humor), Jay-Z (wisdom), Leonardo da Vinci (curiosity), Muhammad Ali (belief), Robin Williams (empathy), Drake (emotional range), Michael Jordan (fire), Bob Marley (peace), Elon Musk (scale), Mark Cuban (execution)",
  values: ["Fun", "Curious", "Present", "Growth", "Goofy", "Authentic", "Confident", "Focused", "Disciplined", "Adventurous"],
  avoid_list: ["game-changer", "unlock", "leverage", "mindset shift", "generic motivation quotes", "self-help guru positioning", "teaching from theory", "advice not validated through experiments"],
  vision_summary: `Build UPath to $100K revenue while becoming undeniably yourself

6 Key Goals:
1. Business: $0 → $50K MRR ($100K+ total revenue)
2. Body: 150 → 170 lbs maintained (identity expansion proof)
3. Audience: 537 → 10K Twitter, 0 → 5K TikTok, 38 → 2K YouTube
4. Income: Bartending → Sales Engineering ($150K) → Full-time UPath by Q4
5. System: Weave as daily OS
6. Identity: Performing/shrinking → Undeniably yourself in any room`,
};

export const BrandVoiceSetup = ({
  open,
  onOpenChange,
  onSaved
}: BrandVoiceSetupProps) => {
  const [template, setTemplate] = useState<BrandVoiceTemplate>(defaultTemplate);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [newValue, setNewValue] = useState("");
  const [newAvoid, setNewAvoid] = useState("");
  const [activeTab, setActiveTab] = useState("identity");

  useEffect(() => {
    if (open) {
      loadTemplate();
    }
  }, [open]);

  const loadTemplate = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('platform_voice_templates')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setTemplate({
          id: data.id,
          brand_identity: data.brand_identity || "",
          content_pillars: (Array.isArray(data.content_pillars) ? data.content_pillars : defaultTemplate.content_pillars) as ContentPillar[],
          platform_voices: (data.platform_voices && typeof data.platform_voices === 'object' ? data.platform_voices : defaultTemplate.platform_voices) as any,
          personality_blend: data.personality_blend || "",
          values: data.values || [],
          avoid_list: data.avoid_list || [],
          vision_summary: data.vision_summary || "",
        });
      }
    } catch (error: any) {
      console.error("Failed to load template:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Cast to any to bypass strict JSON type checking
      const payload: any = {
        user_id: user.id,
        brand_identity: template.brand_identity,
        content_pillars: JSON.parse(JSON.stringify(template.content_pillars)),
        platform_voices: JSON.parse(JSON.stringify(template.platform_voices)),
        personality_blend: template.personality_blend,
        values: template.values,
        avoid_list: template.avoid_list,
        vision_summary: template.vision_summary,
      };

      if (template.id) {
        const { error } = await supabase
          .from('platform_voice_templates')
          .update(payload)
          .eq('id', template.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('platform_voice_templates')
          .insert(payload);
        if (error) throw error;
      }

      toast.success("Brand voice saved!");
      onSaved?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const updatePillar = (index: number, field: keyof ContentPillar, value: string) => {
    const updated = [...template.content_pillars];
    updated[index] = { ...updated[index], [field]: value };
    setTemplate({ ...template, content_pillars: updated });
  };

  const updatePlatformVoice = (platform: keyof typeof template.platform_voices, field: keyof PlatformVoice, value: string) => {
    setTemplate({
      ...template,
      platform_voices: {
        ...template.platform_voices,
        [platform]: {
          ...template.platform_voices[platform],
          [field]: value,
        }
      }
    });
  };

  const addValue = () => {
    if (newValue.trim()) {
      setTemplate({ ...template, values: [...template.values, newValue.trim()] });
      setNewValue("");
    }
  };

  const removeValue = (index: number) => {
    setTemplate({ ...template, values: template.values.filter((_, i) => i !== index) });
  };

  const addAvoid = () => {
    if (newAvoid.trim()) {
      setTemplate({ ...template, avoid_list: [...template.avoid_list, newAvoid.trim()] });
      setNewAvoid("");
    }
  };

  const removeAvoid = (index: number) => {
    setTemplate({ ...template, avoid_list: template.avoid_list.filter((_, i) => i !== index) });
  };

  const importFromIdentitySeed = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('identity_seeds')
        .select('content, core_values, year_note')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast.error("No Identity Seed found. Create one first!");
        return;
      }

      // Parse core values if they exist
      const values = data.core_values 
        ? data.core_values.split(',').map((v: string) => v.trim()).filter(Boolean)
        : template.values;

      setTemplate({
        ...template,
        brand_identity: data.content || template.brand_identity,
        vision_summary: data.year_note || template.vision_summary,
        values: values.length > 0 ? values : template.values,
      });

      toast.success("Imported from Identity Seed!");
    } catch (error: any) {
      toast.error("Failed to import: " + error.message);
    }
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <div className="py-12 text-center">
            <Sparkles className="h-8 w-8 mx-auto animate-spin text-purple-500" />
            <p className="text-muted-foreground mt-4">Loading your brand voice...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Brand Voice Setup</DialogTitle>
          <DialogDescription>
            Configure your brand identity so content is generated in YOUR voice
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-4 flex-shrink-0">
            <TabsTrigger value="identity" className="gap-1.5">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Identity</span>
            </TabsTrigger>
            <TabsTrigger value="pillars" className="gap-1.5">
              <Lightbulb className="h-4 w-4" />
              <span className="hidden sm:inline">Pillars</span>
            </TabsTrigger>
            <TabsTrigger value="platforms" className="gap-1.5">
              <Megaphone className="h-4 w-4" />
              <span className="hidden sm:inline">Platforms</span>
            </TabsTrigger>
            <TabsTrigger value="values" className="gap-1.5">
              <Heart className="h-4 w-4" />
              <span className="hidden sm:inline">Values</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4 min-h-0 space-y-4">
            <TabsContent value="identity" className="mt-0 space-y-4">
              <div className="flex justify-end">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={importFromIdentitySeed}
                  className="gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Import from Identity Seed
                </Button>
              </div>
              <div>
                <Label>Who You Are (Identity Anchor)</Label>
                <Textarea
                  value={template.brand_identity}
                  onChange={(e) => setTemplate({ ...template, brand_identity: e.target.value })}
                  placeholder="Your core identity - who you are, what you're building, what makes you credible..."
                  rows={6}
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This is your identity anchor - what grounds all your content
                </p>
              </div>

              <div>
                <Label>2026 Vision Summary</Label>
                <Textarea
                  value={template.vision_summary}
                  onChange={(e) => setTemplate({ ...template, vision_summary: e.target.value })}
                  placeholder="Your key goals for the year..."
                  rows={3}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label>Personality Blend</Label>
                <Textarea
                  value={template.personality_blend}
                  onChange={(e) => setTemplate({ ...template, personality_blend: e.target.value })}
                  placeholder="The personalities you channel in your content (e.g., 'Ryan Gosling calm power + Kevin Hart humor + Jay-Z wisdom')..."
                  rows={2}
                  className="mt-1.5"
                />
              </div>
            </TabsContent>

            <TabsContent value="pillars" className="mt-0 space-y-4">
              <p className="text-sm text-muted-foreground">
                Your 4 content pillars - everything you post should fit one of these
              </p>
              {template.content_pillars.map((pillar, index) => (
                <div key={index} className="space-y-2 p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Pillar {index + 1}
                    </Badge>
                  </div>
                  <Input
                    value={pillar.name}
                    onChange={(e) => updatePillar(index, 'name', e.target.value)}
                    placeholder={`Pillar ${index + 1} name (e.g., "Building in Public")`}
                  />
                  <Textarea
                    value={pillar.description}
                    onChange={(e) => updatePillar(index, 'description', e.target.value)}
                    placeholder="What this pillar covers..."
                    rows={2}
                  />
                </div>
              ))}
            </TabsContent>

            <TabsContent value="platforms" className="mt-0 space-y-4">
              <p className="text-sm text-muted-foreground">
                How you sound on each platform
              </p>
              {(['tiktok', 'youtube', 'substack', 'twitter'] as const).map((platform) => (
                <div key={platform} className="space-y-2 p-3 border rounded-lg">
                  <Badge variant="outline" className="capitalize">
                    {platform === 'twitter' ? 'X/Twitter' : platform}
                  </Badge>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Tone</Label>
                      <Input
                        value={template.platform_voices[platform].tone}
                        onChange={(e) => updatePlatformVoice(platform, 'tone', e.target.value)}
                        placeholder="e.g., Conversational, energetic"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Style</Label>
                      <Input
                        value={template.platform_voices[platform].style}
                        onChange={(e) => updatePlatformVoice(platform, 'style', e.target.value)}
                        placeholder="e.g., Hook-driven, visual"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Example Post Style</Label>
                    <Textarea
                      value={template.platform_voices[platform].examples}
                      onChange={(e) => updatePlatformVoice(platform, 'examples', e.target.value)}
                      placeholder="Paste an example of your voice on this platform..."
                      rows={2}
                    />
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="values" className="mt-0 space-y-4">
              <div>
                <Label>Core Values</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Values your content should embody
                </p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {template.values.map((value, index) => (
                    <Badge key={index} variant="secondary" className="gap-1">
                      {value}
                      <button onClick={() => removeValue(index)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="Add a value..."
                    onKeyDown={(e) => e.key === 'Enter' && addValue()}
                  />
                  <Button variant="outline" size="icon" onClick={addValue}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <Label>Avoid List</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Things to NEVER include in your content
                </p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {template.avoid_list.map((item, index) => (
                    <Badge key={index} variant="destructive" className="gap-1">
                      {item}
                      <button onClick={() => removeAvoid(index)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newAvoid}
                    onChange={(e) => setNewAvoid(e.target.value)}
                    placeholder='e.g., "game-changer", "unlock", generic motivation...'
                    onKeyDown={(e) => e.key === 'Enter' && addAvoid()}
                  />
                  <Button variant="outline" size="icon" onClick={addAvoid}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Brand Voice
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
