import { motion } from "framer-motion";
import { useMemo } from "react";

interface WeaveVisualizationProps {
  score: number; // 0-100
  size?: "sm" | "md" | "lg";
}

export const WeaveVisualization = ({ score, size = "md" }: WeaveVisualizationProps) => {
  const dimensions = {
    sm: { width: 60, height: 60 },
    md: { width: 100, height: 100 },
    lg: { width: 140, height: 140 },
  };

  const { width, height } = dimensions[size];
  const centerX = width / 2;
  const centerY = height / 2;

  // Generate thread paths based on score
  const threads = useMemo(() => {
    // Number of threads scales with score (min 2, max 12)
    const numThreads = Math.max(2, Math.min(12, Math.floor(score / 8)));
    const threadPaths: Array<{ path: string; delay: number; opacity: number }> = [];

    for (let i = 0; i < numThreads; i++) {
      const angle1 = (i / numThreads) * Math.PI * 2;
      const angle2 = ((i + 2) / numThreads) * Math.PI * 2;
      const radius = (width / 2) * 0.7;

      // Create curved paths between points
      const x1 = centerX + Math.cos(angle1) * radius;
      const y1 = centerY + Math.sin(angle1) * radius;
      const x2 = centerX + Math.cos(angle2) * radius;
      const y2 = centerY + Math.sin(angle2) * radius;

      // Control points for bezier curve (through center-ish)
      const cx = centerX + (Math.random() - 0.5) * radius * 0.5;
      const cy = centerY + (Math.random() - 0.5) * radius * 0.5;

      threadPaths.push({
        path: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`,
        delay: i * 0.1,
        opacity: 0.3 + (score / 100) * 0.5,
      });
    }

    // Add cross-connections for higher scores
    if (score >= 40) {
      const crossCount = Math.floor((score - 40) / 15);
      for (let i = 0; i < crossCount; i++) {
        const angle1 = Math.random() * Math.PI * 2;
        const angle2 = angle1 + Math.PI * (0.5 + Math.random() * 0.5);
        const radius = (width / 2) * (0.3 + Math.random() * 0.4);

        const x1 = centerX + Math.cos(angle1) * radius;
        const y1 = centerY + Math.sin(angle1) * radius;
        const x2 = centerX + Math.cos(angle2) * radius;
        const y2 = centerY + Math.sin(angle2) * radius;

        threadPaths.push({
          path: `M ${x1} ${y1} Q ${centerX} ${centerY} ${x2} ${y2}`,
          delay: numThreads * 0.1 + i * 0.15,
          opacity: 0.2 + (score / 100) * 0.3,
        });
      }
    }

    return threadPaths;
  }, [score, width, height, centerX, centerY]);

  // Phrase based on score
  const phrase = useMemo(() => {
    if (score < 20) return "Starting to gather";
    if (score < 40) return "Threads forming";
    if (score < 60) return "Patterns connecting";
    if (score < 80) return "Weaving together";
    return "Deeply integrated";
  }, [score]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div 
        className="relative flex-shrink-0" 
        style={{ width, height, contain: 'layout size' }}
      >
        <svg 
          width={width} 
          height={height} 
          viewBox={`0 0 ${width} ${height}`}
          className="block"
          style={{ overflow: 'hidden' }}
        >
          {/* Background glow for higher scores */}
          {score >= 50 && (
            <motion.circle
              cx={centerX}
              cy={centerY}
              r={width * 0.35}
              fill="hsl(var(--primary) / 0.1)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
            />
          )}

          {/* Threads */}
          {threads.map((thread, i) => (
            <motion.path
              key={i}
              d={thread.path}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={size === "sm" ? 1.5 : 2}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: thread.opacity }}
              transition={{
                pathLength: { duration: 1, delay: thread.delay, ease: "easeOut" },
                opacity: { duration: 0.4, delay: thread.delay },
              }}
            />
          ))}

          {/* Central node */}
          <motion.circle
            cx={centerX}
            cy={centerY}
            r={size === "sm" ? 4 : size === "md" ? 6 : 8}
            fill="hsl(var(--primary))"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          />

          {/* Outer nodes for higher scores */}
          {score >= 30 && (
            <>
              {[...Array(Math.min(6, Math.floor(score / 15)))].map((_, i) => {
                const angle = (i / 6) * Math.PI * 2;
                const radius = (width / 2) * 0.65;
                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;
                return (
                  <motion.circle
                    key={`node-${i}`}
                    cx={x}
                    cy={y}
                    r={size === "sm" ? 2 : 3}
                    fill="hsl(var(--primary) / 0.6)"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.4 + i * 0.08 }}
                  />
                );
              })}
            </>
          )}
        </svg>
      </div>

      {/* Phrase instead of number */}
      <p className="text-xs text-muted-foreground font-medium">{phrase}</p>
    </div>
  );
};
