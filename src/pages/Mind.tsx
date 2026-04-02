import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Compass, Route, Scale } from "lucide-react";
import IdentitySeed from "./IdentitySeed";
import { ThreadView } from "@/components/explore/ThreadView";
import { MindSynthesis } from "@/components/explore/MindSynthesis";
import { DecisionMirror } from "@/components/dashboard/DecisionMirror";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";

type MindTab = "identity" | "thread" | "mirror";

const Mind = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<MindTab>("identity");
  const [insightCount, setInsightCount] = useState(0);
  const [identityContext, setIdentityContext] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [insightsRes, identityRes] = await Promise.all([
        supabase.from("insights").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("identity_seeds").select("weekly_focus, year_note, core_values, content").eq("user_id", user.id).maybeSingle(),
      ]);
      setInsightCount(insightsRes.count || 0);
      if (identityRes.data) {
        setIdentityContext({
          yearNote: identityRes.data.year_note,
          weeklyFocus: identityRes.data.weekly_focus,
        });
      }
    };
    load();
  }, [user]);

  const tabs = [
    { id: "identity" as MindTab, label: "Identity", icon: Compass },
    { id: "thread" as MindTab, label: "Thread", icon: Route },
    { id: "mirror" as MindTab, label: "Mirror", icon: Scale },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Tab navigation — underline style */}
      <div className="flex items-center border-b border-border/30">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground/40 hover:text-muted-foreground"
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="mind-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === "identity" && <IdentitySeed />}
          {activeTab === "thread" && (
            <div className="max-w-lg mx-auto space-y-5">
              <div className="text-center space-y-1">
                <h1 className="text-2xl font-display font-semibold">The Thread</h1>
                <p className="text-sm text-muted-foreground/40">{insightCount} insights woven</p>
              </div>
              <ThreadSubTabs insightCount={insightCount} identityContext={identityContext} userId={user?.id || ""} />
            </div>
          )}
          {activeTab === "mirror" && <DecisionMirror embedded />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

// Thread sub-tabs
const ThreadSubTabs = ({ insightCount, identityContext, userId }: { insightCount: number; identityContext: any; userId: string }) => {
  const [sub, setSub] = useState<"roadmap" | "synthesize">("roadmap");
  return (
    <div className="space-y-5">
      <div className="flex justify-center gap-6 border-b border-border/20">
        {(["roadmap", "synthesize"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSub(tab)}
            className={`relative pb-2.5 text-sm font-medium transition-colors capitalize ${
              sub === tab ? "text-foreground" : "text-muted-foreground/30 hover:text-muted-foreground"
            }`}
          >
            {tab}
            {sub === tab && (
              <motion.div
                layoutId="thread-sub-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>
      {sub === "roadmap" ? (
        <ThreadView userId={userId} yearNote={identityContext?.yearNote} weeklyFocus={identityContext?.weeklyFocus} insightCount={insightCount} />
      ) : (
        <MindSynthesis insightCount={insightCount} />
      )}
    </div>
  );
};

export default Mind;