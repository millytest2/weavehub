import { cn } from "@/lib/utils";

interface WeaveLoaderProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  text?: string;
}

export const WeaveLoader = ({ size = "md", className, text }: WeaveLoaderProps) => {
  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-10 h-10",
    lg: "w-16 h-16",
  };

  const barSizes = {
    sm: "w-1",
    md: "w-1.5",
    lg: "w-2",
  };

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className={cn("relative", sizeClasses[size])}>
        {/* Three weaving bars */}
        <div
          className={cn(
            "absolute left-1/2 h-full rounded-full bg-primary -translate-x-1/2 animate-weave-left",
            barSizes[size]
          )}
          style={{ animationDelay: "0ms" }}
        />
        <div
          className={cn(
            "absolute left-1/2 h-full rounded-full bg-primary/70 -translate-x-1/2 animate-weave-center",
            barSizes[size]
          )}
          style={{ animationDelay: "150ms" }}
        />
        <div
          className={cn(
            "absolute left-1/2 h-full rounded-full bg-primary/40 -translate-x-1/2 animate-weave-right",
            barSizes[size]
          )}
          style={{ animationDelay: "300ms" }}
        />
      </div>
      {text && (
        <p className="text-sm text-muted-foreground animate-pulse">{text}</p>
      )}
    </div>
  );
};

// Simpler dot-based weave loader
export const WeaveDotsLoader = ({ className }: { className?: string }) => {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full bg-primary animate-weave-dot"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
};

// Skeleton card loader
export const WeaveCardSkeleton = ({ className }: { className?: string }) => {
  return (
    <div className={cn("rounded-xl border border-border/50 bg-card/50 p-4 space-y-3 animate-pulse", className)}>
      <div className="h-3 w-20 bg-muted rounded" />
      <div className="space-y-2">
        <div className="h-5 w-full bg-muted rounded" />
        <div className="h-4 w-3/4 bg-muted/70 rounded" />
      </div>
      <div className="h-10 w-full bg-muted/50 rounded-lg" />
    </div>
  );
};

// List item skeleton
export const WeaveListSkeleton = ({ count = 3 }: { count?: number }) => {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 animate-pulse"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="w-8 h-8 rounded-lg bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-2/3 bg-muted rounded" />
            <div className="h-3 w-1/3 bg-muted/70 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
};
