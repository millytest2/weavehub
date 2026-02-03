import { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lightbulb, FileText, FlaskConical, ArrowRight, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GraphNode {
  id: string;
  type: "insight" | "document" | "experiment";
  title: string;
  content: string;
  theme?: string;
  source?: string;
  connections: string[]; // IDs of connected nodes
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface KnowledgeGraphProps {
  insights: Array<{
    id: string;
    title: string;
    content: string;
    source?: string;
    topic_id?: string;
  }>;
  documents: Array<{
    id: string;
    title: string;
    summary?: string;
    topic_id?: string;
  }>;
  experiments: Array<{
    id: string;
    title: string;
    description?: string;
    topic_id?: string;
  }>;
  topics: Array<{ id: string; name: string; color?: string }>;
  onNodeClick: (node: GraphNode) => void;
  yearNote?: string;
}

// Theme colors for visual distinction
const THEME_COLORS: Record<string, string> = {
  identity: "hsl(280, 60%, 55%)",
  mindset: "hsl(260, 50%, 50%)",
  content: "hsl(340, 60%, 55%)",
  building: "hsl(200, 70%, 50%)",
  health: "hsl(140, 50%, 45%)",
  business: "hsl(35, 80%, 50%)",
  presence: "hsl(180, 50%, 45%)",
  learning: "hsl(220, 60%, 55%)",
  connection: "hsl(350, 55%, 55%)",
  default: "hsl(var(--primary))",
};

// Extract theme from content using keywords
function extractTheme(title: string, content: string): string {
  const text = `${title} ${content}`.toLowerCase();
  
  const themeKeywords: Record<string, string[]> = {
    identity: ["identity", "self", "who i am", "becoming", "belief", "ego", "transform"],
    mindset: ["mindset", "mental", "thoughts", "psychology", "fear", "confidence"],
    content: ["content", "posting", "social", "audience", "creator", "video", "tiktok"],
    building: ["build", "ship", "create", "product", "startup", "making", "coding"],
    health: ["health", "fitness", "body", "exercise", "sleep", "energy", "workout"],
    business: ["business", "money", "income", "sales", "revenue", "client", "deal"],
    presence: ["presence", "awareness", "meditation", "calm", "nervous system", "grounding"],
    learning: ["learn", "skill", "practice", "study", "knowledge", "understand"],
    connection: ["relationship", "people", "network", "social", "connect", "community"],
  };
  
  for (const [theme, keywords] of Object.entries(themeKeywords)) {
    if (keywords.some(kw => text.includes(kw))) {
      return theme;
    }
  }
  return "default";
}

// Find connections between nodes based on shared themes/topics and semantic similarity
function findConnections(nodes: GraphNode[]): void {
  // Group by theme
  const themeGroups: Record<string, string[]> = {};
  nodes.forEach(node => {
    if (node.theme) {
      if (!themeGroups[node.theme]) themeGroups[node.theme] = [];
      themeGroups[node.theme].push(node.id);
    }
  });
  
  // Connect nodes within same theme (limit connections for visual clarity)
  nodes.forEach(node => {
    if (node.theme && themeGroups[node.theme]) {
      const sameTheme = themeGroups[node.theme].filter(id => id !== node.id);
      // Take up to 3 closest connections by index proximity
      node.connections = sameTheme.slice(0, 3);
    }
  });
  
  // Also connect by keyword overlap
  nodes.forEach((node, i) => {
    const nodeWords = new Set(node.title.toLowerCase().split(/\s+/));
    nodes.forEach((other, j) => {
      if (i >= j) return;
      const otherWords = other.title.toLowerCase().split(/\s+/);
      const overlap = otherWords.filter(w => nodeWords.has(w) && w.length > 3).length;
      if (overlap >= 2 && !node.connections.includes(other.id)) {
        node.connections.push(other.id);
        other.connections.push(node.id);
      }
    });
  });
}

export const KnowledgeGraph = ({ 
  insights, 
  documents, 
  experiments, 
  topics,
  onNodeClick,
  yearNote
}: KnowledgeGraphProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const animationRef = useRef<number>();
  const nodesRef = useRef<GraphNode[]>([]);
  
  // Build nodes from all data sources
  const nodes = useMemo(() => {
    const allNodes: GraphNode[] = [];
    const width = dimensions.width || 400;
    const height = dimensions.height || 400;
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Add insights (max 100 for performance)
    insights.slice(0, 100).forEach((insight, i) => {
      const angle = (i / Math.min(insights.length, 100)) * Math.PI * 2;
      const radius = 100 + Math.random() * 80;
      allNodes.push({
        id: insight.id,
        type: "insight",
        title: insight.title,
        content: insight.content || "",
        theme: extractTheme(insight.title, insight.content || ""),
        source: insight.source,
        connections: [],
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      });
    });
    
    // Add documents
    documents.slice(0, 20).forEach((doc, i) => {
      const angle = (i / Math.min(documents.length, 20)) * Math.PI * 2 + Math.PI / 4;
      const radius = 150 + Math.random() * 50;
      allNodes.push({
        id: doc.id,
        type: "document",
        title: doc.title,
        content: doc.summary || "",
        theme: extractTheme(doc.title, doc.summary || ""),
        connections: [],
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      });
    });
    
    // Add experiments
    experiments.slice(0, 10).forEach((exp, i) => {
      const angle = (i / Math.min(experiments.length, 10)) * Math.PI * 2 + Math.PI / 6;
      const radius = 130 + Math.random() * 40;
      allNodes.push({
        id: exp.id,
        type: "experiment",
        title: exp.title,
        content: exp.description || "",
        theme: extractTheme(exp.title, exp.description || ""),
        connections: [],
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      });
    });
    
    // Find connections
    findConnections(allNodes);
    
    return allNodes;
  }, [insights, documents, experiments, dimensions]);
  
  // Store nodes in ref for animation access
  useEffect(() => {
    nodesRef.current = [...nodes];
  }, [nodes]);
  
  // Handle resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };
    
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);
  
  // Animation loop - simple force simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || dimensions.width === 0) return;
    
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    
    const animate = () => {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);
      
      const currentNodes = nodesRef.current;
      
      // Simple physics - attract to connections, repel from others
      currentNodes.forEach(node => {
        // Attract to center gently
        node.vx += (centerX - node.x) * 0.0005;
        node.vy += (centerY - node.y) * 0.0005;
        
        // Repel from other nodes
        currentNodes.forEach(other => {
          if (other.id === node.id) return;
          const dx = node.x - other.x;
          const dy = node.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 80) {
            const force = (80 - dist) * 0.002;
            node.vx += (dx / dist) * force;
            node.vy += (dy / dist) * force;
          }
        });
        
        // Attract to connections
        node.connections.forEach(connId => {
          const conn = currentNodes.find(n => n.id === connId);
          if (conn) {
            const dx = conn.x - node.x;
            const dy = conn.y - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            if (dist > 60) {
              node.vx += dx * 0.0003;
              node.vy += dy * 0.0003;
            }
          }
        });
        
        // Apply velocity with damping
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= 0.95;
        node.vy *= 0.95;
        
        // Keep in bounds
        node.x = Math.max(20, Math.min(dimensions.width - 20, node.x));
        node.y = Math.max(20, Math.min(dimensions.height - 20, node.y));
      });
      
      // Draw connections first (behind nodes)
      ctx.strokeStyle = "hsl(var(--border))";
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.3;
      currentNodes.forEach(node => {
        node.connections.forEach(connId => {
          const conn = currentNodes.find(n => n.id === connId);
          if (conn) {
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(conn.x, conn.y);
            ctx.stroke();
          }
        });
      });
      ctx.globalAlpha = 1;
      
      // Draw nodes
      currentNodes.forEach(node => {
        const color = THEME_COLORS[node.theme || "default"] || THEME_COLORS.default;
        const isHovered = hoveredNode?.id === node.id;
        const isSelected = selectedNode?.id === node.id;
        const size = node.type === "insight" ? 6 : node.type === "document" ? 8 : 7;
        
        ctx.beginPath();
        ctx.arc(node.x, node.y, size + (isHovered || isSelected ? 3 : 0), 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = isHovered || isSelected ? 1 : 0.7;
        ctx.fill();
        ctx.globalAlpha = 1;
        
        // Glow for selected
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, size + 8, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.4;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      });
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [dimensions, hoveredNode, selectedNode]);
  
  // Handle mouse interactions
  const handleCanvasClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const clicked = nodesRef.current.find(node => {
      const dx = node.x - x;
      const dy = node.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 15;
    });
    
    if (clicked) {
      setSelectedNode(clicked);
      onNodeClick(clicked);
    } else {
      setSelectedNode(null);
    }
  };
  
  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const hovered = nodesRef.current.find(node => {
      const dx = node.x - x;
      const dy = node.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 15;
    });
    
    setHoveredNode(hovered || null);
  };
  
  // Get connected nodes for selected node
  const connectedNodes = useMemo(() => {
    if (!selectedNode) return [];
    return nodesRef.current.filter(n => selectedNode.connections.includes(n.id));
  }, [selectedNode]);
  
  // Theme legend
  const activeThemes = useMemo(() => {
    const themes = new Set<string>();
    nodes.forEach(n => n.theme && themes.add(n.theme));
    return Array.from(themes).filter(t => t !== "default");
  }, [nodes]);
  
  return (
    <div ref={containerRef} className="relative w-full h-[400px] bg-muted/20 rounded-2xl overflow-hidden">
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMouseMove}
        className="cursor-pointer"
      />
      
      {/* Hover tooltip */}
      <AnimatePresence>
        {hoveredNode && !selectedNode && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-4 left-4 right-4 bg-background/95 backdrop-blur-sm rounded-xl p-3 shadow-lg border"
          >
            <div className="flex items-center gap-2 mb-1">
              {hoveredNode.type === "insight" && <Lightbulb className="h-4 w-4 text-primary" />}
              {hoveredNode.type === "document" && <FileText className="h-4 w-4 text-blue-500" />}
              {hoveredNode.type === "experiment" && <FlaskConical className="h-4 w-4 text-green-500" />}
              <span className="text-xs font-medium capitalize">{hoveredNode.type}</span>
              {hoveredNode.theme && (
                <span 
                  className="text-xs px-1.5 py-0.5 rounded-full ml-auto"
                  style={{ 
                    backgroundColor: `${THEME_COLORS[hoveredNode.theme]}20`,
                    color: THEME_COLORS[hoveredNode.theme]
                  }}
                >
                  {hoveredNode.theme}
                </span>
              )}
            </div>
            <p className="text-sm font-medium line-clamp-1">{hoveredNode.title}</p>
            <p className="text-xs text-muted-foreground">Tap to see connections</p>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Selected node detail */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 bg-background/98 backdrop-blur-sm p-4 overflow-auto"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                {selectedNode.type === "insight" && <Lightbulb className="h-5 w-5 text-primary" />}
                {selectedNode.type === "document" && <FileText className="h-5 w-5 text-blue-500" />}
                {selectedNode.type === "experiment" && <FlaskConical className="h-5 w-5 text-green-500" />}
                <span className="text-xs font-medium capitalize text-muted-foreground">
                  {selectedNode.type}
                </span>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8" 
                onClick={() => setSelectedNode(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <h3 className="font-display text-lg font-semibold mb-2">{selectedNode.title}</h3>
            <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
              {selectedNode.content}
            </p>
            
            {connectedNodes.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Link2 className="h-3.5 w-3.5" />
                  <span>Connected to {connectedNodes.length} other{connectedNodes.length > 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-1.5">
                  {connectedNodes.slice(0, 5).map(conn => (
                    <button
                      key={conn.id}
                      onClick={() => setSelectedNode(conn)}
                      className="w-full flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
                    >
                      {conn.type === "insight" && <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0" />}
                      {conn.type === "document" && <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                      {conn.type === "experiment" && <FlaskConical className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                      <span className="text-sm line-clamp-1">{conn.title}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {yearNote && (
              <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/20">
                <p className="text-xs text-primary font-medium mb-1">How this connects to 2026</p>
                <p className="text-xs text-muted-foreground">
                  This {selectedNode.theme} insight contributes to your direction of{" "}
                  {yearNote.split(" ").slice(0, 10).join(" ")}...
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Theme legend */}
      {!selectedNode && activeThemes.length > 0 && (
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {activeThemes.slice(0, 6).map(theme => (
            <div 
              key={theme}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs"
              style={{ 
                backgroundColor: `${THEME_COLORS[theme]}15`,
                color: THEME_COLORS[theme]
              }}
            >
              <div 
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: THEME_COLORS[theme] }}
              />
              <span className="capitalize">{theme}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Stats */}
      {!selectedNode && (
        <div className="absolute bottom-3 right-3 text-xs text-muted-foreground">
          {nodes.length} nodes • {nodes.reduce((acc, n) => acc + n.connections.length, 0) / 2} connections
        </div>
      )}
    </div>
  );
};
