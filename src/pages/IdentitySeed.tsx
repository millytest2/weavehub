import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Lightbulb } from "lucide-react";

export default function IdentitySeed() {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [identitySeedId, setIdentitySeedId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchIdentitySeed();
    }
  }, [user]);

  const fetchIdentitySeed = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("identity_seeds")
        .select("*")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching identity seed:", error);
        return;
      }

      if (data) {
        setContent(data.content);
        setIdentitySeedId(data.id);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleSave = async () => {
    if (!content.trim()) {
      toast.error("Please write your identity seed");
      return;
    }

    setLoading(true);
    try {
      if (identitySeedId) {
        const { error } = await (supabase as any)
          .from("identity_seeds")
          .update({ content })
          .eq("id", identitySeedId);

        if (error) throw error;
        toast.success("Identity seed updated");
      } else {
        const { data, error } = await (supabase as any)
          .from("identity_seeds")
          .insert({ user_id: user?.id, content })
          .select()
          .single();

        if (error) throw error;
        setIdentitySeedId(data.id);
        toast.success("Identity seed created");
      }
    } catch (error) {
      console.error("Error saving identity seed:", error);
      toast.error("Failed to save identity seed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Lightbulb className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Identity Seed</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Your North Star — the foundation of who you are becoming and who you already are now.
        </p>
      </div>

      <div className="bg-card rounded-xl shadow-sm p-6 space-y-6">
        <div>
          <label className="text-sm font-medium mb-2 block">
            Write your complete identity statement
          </label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="I am a Full-Stack Human — mind, body, spirit, creativity, ambition, and calm grounded presence working together..."
            className="min-h-[400px] text-base leading-relaxed resize-none"
          />
          <p className="text-xs text-muted-foreground mt-2">
            This guides your spiritual connection, learning, projects, experiments, relationships, and daily actions.
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={loading}
            size="lg"
            className="gap-2"
          >
            {loading ? "Saving..." : "Save Identity Seed"}
          </Button>
        </div>
      </div>
    </div>
  );
}
