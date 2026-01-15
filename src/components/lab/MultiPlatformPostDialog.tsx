import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { 
  Copy, 
  Check, 
  Sparkles, 
  Network,
  RefreshCw
} from "lucide-react";

// Platform icons as simple components
const TikTokIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
  </svg>
);

const YouTubeIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const SubstackIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"/>
  </svg>
);

const TwitterIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

interface PlatformContent {
  tiktok: {
    hook: string;
    format_notes: string;
    script_outline: string;
  };
  youtube: {
    title: string;
    description: string;
    key_points: string[];
  };
  substack: {
    headline: string;
    intro: string;
    sections_outline: string[];
  };
  twitter: {
    single_tweet: string;
    thread_outline: string[];
  };
}

interface Connection {
  title: string;
  insight: string;
  domains: string[];
  sources?: string[];
}

interface MultiPlatformPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: Connection | null;
}

export const MultiPlatformPostDialog = ({
  open,
  onOpenChange,
  connection
}: MultiPlatformPostDialogProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [platformContent, setPlatformContent] = useState<PlatformContent | null>(null);
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("tiktok");

  const handleGenerate = async () => {
    if (!connection) return;
    
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("synthesizer", {
        body: {
          mode: "multi_platform_post",
          connection
        }
      });

      if (error) throw error;
      
      if (data.platforms) {
        setPlatformContent(data.platforms);
        toast.success("Platform content generated!");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate content");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (platform: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedPlatform(platform);
    setTimeout(() => setCopiedPlatform(null), 2000);
    toast.success(`${platform} content copied!`);
  };

  const formatTikTokContent = () => {
    if (!platformContent?.tiktok) return "";
    const { hook, format_notes, script_outline } = platformContent.tiktok;
    return `HOOK:\n${hook}\n\nFORMAT NOTES:\n${format_notes}\n\nSCRIPT OUTLINE:\n${script_outline}`;
  };

  const formatYouTubeContent = () => {
    if (!platformContent?.youtube) return "";
    const { title, description, key_points } = platformContent.youtube;
    return `TITLE:\n${title}\n\nDESCRIPTION:\n${description}\n\nKEY POINTS:\n${key_points?.map((p, i) => `${i + 1}. ${p}`).join('\n') || ''}`;
  };

  const formatSubstackContent = () => {
    if (!platformContent?.substack) return "";
    const { headline, intro, sections_outline } = platformContent.substack;
    return `HEADLINE:\n${headline}\n\nINTRO:\n${intro}\n\nSECTIONS:\n${sections_outline?.map((s, i) => `${i + 1}. ${s}`).join('\n') || ''}`;
  };

  const formatTwitterContent = () => {
    if (!platformContent?.twitter) return "";
    const { single_tweet, thread_outline } = platformContent.twitter;
    return `SINGLE TWEET:\n${single_tweet}\n\nTHREAD:\n${thread_outline?.map((t, i) => `${i + 1}/ ${t}`).join('\n\n') || ''}`;
  };

  const platforms = [
    { id: "tiktok", label: "TikTok", icon: TikTokIcon, color: "text-pink-500", getContent: formatTikTokContent },
    { id: "youtube", label: "YouTube", icon: YouTubeIcon, color: "text-red-500", getContent: formatYouTubeContent },
    { id: "substack", label: "Substack", icon: SubstackIcon, color: "text-orange-500", getContent: formatSubstackContent },
    { id: "twitter", label: "X/Twitter", icon: TwitterIcon, color: "text-foreground", getContent: formatTwitterContent },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-purple-500" />
            Multi-Platform Content Router
          </DialogTitle>
          <DialogDescription>
            Transform this cross-domain connection into platform-specific content
          </DialogDescription>
        </DialogHeader>

        {/* Connection context */}
        {connection && (
          <Card className="bg-muted/50 flex-shrink-0">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-2">
                {connection.domains?.map((domain, i) => (
                  <Badge 
                    key={i} 
                    variant="outline" 
                    className={`text-xs ${
                      domain === 'physics' ? 'border-blue-500 text-blue-500' :
                      domain === 'business' ? 'border-green-500 text-green-500' :
                      domain === 'life' ? 'border-pink-500 text-pink-500' :
                      'border-purple-500 text-purple-500'
                    }`}
                  >
                    {domain}
                  </Badge>
                ))}
              </div>
              <p className="font-medium">{connection.title}</p>
              <p className="text-sm text-muted-foreground mt-1">{connection.insight}</p>
            </CardContent>
          </Card>
        )}

        {/* Generate button if no content yet */}
        {!platformContent && !isGenerating && (
          <Button onClick={handleGenerate} className="w-full">
            <Sparkles className="h-4 w-4 mr-2" />
            Generate Platform Content
          </Button>
        )}

        {/* Loading state */}
        {isGenerating && (
          <div className="py-12 text-center flex-1">
            <Sparkles className="h-8 w-8 mx-auto animate-spin text-purple-500 mb-4" />
            <p className="text-muted-foreground">Crafting content for each platform...</p>
            <p className="text-xs text-muted-foreground/70 mt-2">TikTok • YouTube • Substack • X/Twitter</p>
          </div>
        )}

        {/* Platform tabs with content */}
        {platformContent && !isGenerating && (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="grid w-full grid-cols-4 flex-shrink-0">
                {platforms.map(({ id, label, icon: Icon, color }) => (
                  <TabsTrigger key={id} value={id} className="gap-1.5">
                    <span className={color}><Icon /></span>
                    <span className="hidden sm:inline">{label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="flex-1 overflow-y-auto mt-4 min-h-0">
                {platforms.map(({ id, label, getContent }) => (
                  <TabsContent key={id} value={id} className="mt-0 space-y-3 h-full">
                    <Textarea 
                      value={getContent()}
                      readOnly
                      rows={12}
                      className="font-mono text-sm resize-none"
                    />
                    <div className="flex gap-2">
                      <Button 
                        onClick={() => handleCopy(label, getContent())} 
                        variant="outline" 
                        className="flex-1"
                      >
                        {copiedPlatform === label ? (
                          <>
                            <Check className="h-4 w-4 mr-2" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy {label} Content
                          </>
                        )}
                      </Button>
                      <Button 
                        onClick={handleGenerate} 
                        variant="outline"
                        disabled={isGenerating}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Regenerate
                      </Button>
                    </div>
                  </TabsContent>
                ))}
              </div>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
