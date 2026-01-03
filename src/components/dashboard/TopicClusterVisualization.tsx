import { useMemo } from "react";
import { Zap } from "lucide-react";

interface InsightCluster {
  theme: string;
  color: string | null;
  insights: { id: string; title: string; content: string }[];
  recentCount: number;
}

interface TopicClusterVisualizationProps {
  clusters: InsightCluster[];
  identityKeywords?: string[];
}

export function TopicClusterVisualization({ clusters, identityKeywords = [] }: TopicClusterVisualizationProps) {
  // Calculate identity alignment for each cluster
  const clustersWithAlignment = useMemo(() => {
    const maxSize = Math.max(...clusters.map(c => c.insights.length), 1);
    
    return clusters
      .filter(c => c.theme !== "Uncategorized")
      .slice(0, 8) // Limit to 8 topics for visual clarity
      .map(cluster => {
        // Calculate identity alignment based on keyword matches
        let alignmentScore = 0;
        if (identityKeywords.length > 0) {
          const allText = cluster.insights.map(i => `${i.title} ${i.content}`).join(" ").toLowerCase();
          alignmentScore = identityKeywords.reduce((score, keyword) => {
            // Escape special regex characters to prevent invalid regex errors
            const escapedKeyword = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            try {
              const matches = (allText.match(new RegExp(escapedKeyword, "g")) || []).length;
              return score + Math.min(matches, 5);
            } catch {
              return score; // Skip invalid keywords
            }
          }, 0) / (identityKeywords.length * 5);
        }
        
        // Normalize size (40-100%)
        const sizePercent = 40 + (cluster.insights.length / maxSize) * 60;
        
        return {
          ...cluster,
          alignmentScore: Math.min(alignmentScore, 1),
          sizePercent,
          isHot: cluster.recentCount >= 3,
        };
      });
  }, [clusters, identityKeywords]);

  // Find potential connections between clusters (shared keywords)
  const connections = useMemo(() => {
    const result: { from: string; to: string; strength: number }[] = [];
    
    for (let i = 0; i < clustersWithAlignment.length; i++) {
      for (let j = i + 1; j < clustersWithAlignment.length; j++) {
        const a = clustersWithAlignment[i];
        const b = clustersWithAlignment[j];
        
        // Extract keywords from each cluster
        const aWords = new Set(
          a.insights
            .flatMap(ins => `${ins.title} ${ins.content}`.toLowerCase().split(/\s+/))
            .filter(w => w.length > 4)
        );
        const bWords = new Set(
          b.insights
            .flatMap(ins => `${ins.title} ${ins.content}`.toLowerCase().split(/\s+/))
            .filter(w => w.length > 4)
        );
        
        // Count shared words
        const shared = [...aWords].filter(w => bWords.has(w)).length;
        const strength = Math.min(shared / 20, 1); // Normalize
        
        if (strength > 0.15) {
          result.push({ from: a.theme, to: b.theme, strength });
        }
      }
    }
    
    return result.sort((a, b) => b.strength - a.strength).slice(0, 6);
  }, [clustersWithAlignment]);

  if (clustersWithAlignment.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-muted/20 border border-border/20 text-center">
        <p className="text-xs text-muted-foreground">Start capturing to see your patterns emerge</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Visual cluster map */}
      <div className="relative p-4 rounded-xl bg-muted/20 border border-border/20 min-h-[180px]">
        <div className="flex flex-wrap gap-2 justify-center items-center">
          {clustersWithAlignment.map((cluster, idx) => {
            const size = Math.round(cluster.sizePercent * 0.7); // Scale down for display
            const hasConnection = connections.some(c => c.from === cluster.theme || c.to === cluster.theme);
            
            return (
              <div
                key={cluster.theme}
                className="relative group cursor-default"
                style={{
                  animationDelay: `${idx * 100}ms`,
                }}
              >
                <div
                  className={`
                    flex items-center justify-center rounded-full transition-all duration-300
                    ${hasConnection ? 'ring-2 ring-primary/20' : ''}
                  `}
                  style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    backgroundColor: cluster.color 
                      ? `${cluster.color}20` 
                      : 'hsl(var(--muted))',
                    borderWidth: 2,
                    borderColor: cluster.color || 'hsl(var(--border))',
                  }}
                >
                  <span 
                    className="text-[10px] font-medium text-center px-1 leading-tight"
                    style={{ 
                      color: cluster.color || 'hsl(var(--foreground))',
                      maxWidth: `${size - 8}px`,
                    }}
                  >
                    {cluster.theme.length > 12 ? cluster.theme.slice(0, 10) + "..." : cluster.theme}
                  </span>
                  
                  {cluster.isHot && (
                    <Zap className="absolute -top-1 -right-1 h-3 w-3 text-amber-500 fill-amber-500" />
                  )}
                </div>
                
                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover border border-border rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                  <p className="text-xs font-medium">{cluster.theme}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {cluster.insights.length} insights
                    {cluster.alignmentScore > 0.3 && " • identity-aligned"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Legend - only show if clusters have activity */}
        {clustersWithAlignment.some(c => c.isHot) && (
          <div className="absolute top-2 right-2">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Zap className="h-3 w-3 text-amber-500" />
              <span>recent</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Connections are calculated but not displayed - system uses them internally */}
    </div>
  );
}
