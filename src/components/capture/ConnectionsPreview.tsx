import { motion } from "framer-motion";
import { Lightbulb, Link2, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConnectedInsight {
  id: string;
  title: string;
  similarity: number;
}

interface ConnectionsPreviewProps {
  savedTitle: string;
  connections: ConnectedInsight[];
  synthesis?: string;
  capability?: string;
  onClose: () => void;
  onRunExperiment?: () => void;
}

export const ConnectionsPreview = ({
  savedTitle,
  connections,
  synthesis,
  capability,
  onClose,
  onRunExperiment,
}: ConnectionsPreviewProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="space-y-4"
    >
      {/* Success header */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20">
        <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Woven into your knowledge</p>
          <p className="text-xs text-muted-foreground line-clamp-1">{savedTitle}</p>
        </div>
      </div>

      {/* Connections */}
      {connections.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <Link2 className="h-3.5 w-3.5" />
            <span>Connects to {connections.length} existing insight{connections.length > 1 ? "s" : ""}</span>
          </div>
          <div className="space-y-1.5">
            {connections.slice(0, 3).map((conn, i) => (
              <motion.div
                key={conn.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 border border-border/50"
              >
                <Lightbulb className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm line-clamp-1 flex-1">{conn.title}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {Math.round(conn.similarity * 100)}% match
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Synthesis - how it weaves together */}
      {synthesis && (
        <div className="p-3 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20">
          <p className="text-xs text-primary font-medium mb-1">What you're building</p>
          <p className="text-sm leading-relaxed">{synthesis}</p>
        </div>
      )}

      {/* Capability being developed */}
      {capability && (
        <div className="p-3 rounded-xl bg-muted/50 border border-border/50">
          <p className="text-xs text-muted-foreground mb-1">Capability this develops</p>
          <p className="text-sm font-medium">{capability}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onClose} className="flex-1">
          Done
        </Button>
        {onRunExperiment && (
          <Button onClick={onRunExperiment} className="flex-1">
            Run experiment
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </motion.div>
  );
};
