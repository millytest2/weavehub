import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Compass, FlaskConical, Route, PenLine } from "lucide-react";
import IdentitySeed from "./IdentitySeed";
import Experiments from "./Experiments";
import { ThreadView } from "@/components/explore/ThreadView";
import { MindSynthesis } from "@/components/explore/MindSynthesis";
import { useAuth } from "@/components/auth/AuthProvider";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type MindTab = "identity" | "thread" | "experiments" | "lab";

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
    { id: "experiments" as MindTab, label: "Experiments", icon: FlaskConical },
    { id: "lab" as MindTab, label: "Lab", icon: PenLine },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-2xl overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "identity" && <IdentitySeed />}
          {activeTab === "thread" && (
            <div className="max-w-lg mx-auto space-y-4">
              <div className="text-center space-y-1">
                <h1 className="text-2xl font-display font-semibold">The Thread</h1>
                <p className="text-sm text-muted-foreground">{insightCount} insights woven</p>
              </div>
              <div className="flex gap-2 p-1 bg-muted/50 rounded-2xl">
                <ThreadTabSwitcher insightCount={insightCount} identityContext={identityContext} userId={user?.id || ""} />
              </div>
            </div>
          )}
          {activeTab === "experiments" && <Experiments />}
          {activeTab === "lab" && <LabRedirect />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

// Thread sub-tabs
const ThreadTabSwitcher = ({ insightCount, identityContext, userId }: { insightCount: number; identityContext: any; userId: string }) => {
  const [sub, setSub] = useState<"roadmap" | "synthesize">("roadmap");
  return (
    <div className="w-full space-y-4">
      <div className="flex gap-2 p-1 bg-muted/30 rounded-xl">
        <button
          onClick={() => setSub("roadmap")}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            sub === "roadmap" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
          }`}
        >
          Roadmap
        </button>
        <button
          onClick={() => setSub("synthesize")}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            sub === "synthesize" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
          }`}
        >
          Synthesize
        </button>
      </div>
      {sub === "roadmap" ? (
        <ThreadView
          userId={userId}
          yearNote={identityContext?.yearNote}
          weeklyFocus={identityContext?.weeklyFocus}
          insightCount={insightCount}
        />
      ) : (
        <MindSynthesis insightCount={insightCount} />
      )}
    </div>
  );
};

// Lab redirect - imports Lab content directly
import Lab from "./Lab";
const LabRedirect = () => <Lab embedded />;

export default Mind;
