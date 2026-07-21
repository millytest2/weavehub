import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Compass, Route, MessageCircle, FlaskConical, BookOpen } from "lucide-react";
import IdentitySeed from "./IdentitySeed";
import { ThreadWeave } from "@/components/mind/ThreadWeave";
import { AskWeave } from "@/components/mind/AskWeave";
import { ResearchFeed } from "@/components/lab/ResearchFeed";

import Lab from "./Lab";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";

type MindTab = "identity" | "thread" | "research" | "ask" | "lab";

const Mind = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const initialTab = (new URLSearchParams(location.search).get("tab") as MindTab) || "identity";
  const [activeTab, setActiveTab] = useState<MindTab>(initialTab);
  const [insightCount, setInsightCount] = useState(0);

  // Sync when URL query changes (e.g. clicking Research from top nav while on Mind)
  useEffect(() => {
    const tab = (new URLSearchParams(location.search).get("tab") as MindTab) || "identity";
    setActiveTab(tab);
  }, [location.search]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const insightsRes = await supabase
        .from("insights")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      setInsightCount(insightsRes.count || 0);
    };
    load();
  }, [user]);

  const tabs = [
    { id: "identity" as MindTab, label: "Identity", icon: Compass },
    { id: "thread" as MindTab, label: "Thread", icon: Route },
    { id: "research" as MindTab, label: "Research", icon: BookOpen },
    { id: "lab" as MindTab, label: "Lab", icon: FlaskConical },
    { id: "ask" as MindTab, label: "Ask", icon: MessageCircle },
  ];

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5 sm:space-y-6">
      {/* Tab navigation — underline style, mobile-friendly */}
      <div className="flex items-center border-b border-border/30 overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2.5 sm:py-3 text-[13px] sm:text-sm font-medium transition-colors shrink-0 ${
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
                <p className="text-sm text-muted-foreground/40">
                  {insightCount} insights woven with this week's reads and rhythm
                </p>
              </div>
              <ThreadWeave insightCount={insightCount} />
            </div>
          )}
          {activeTab === "research" && (
            <div className="max-w-lg mx-auto">
              <ResearchFeed />
            </div>
          )}
          {activeTab === "lab" && <Lab embedded />}
          {activeTab === "ask" && <AskWeave />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default Mind;
