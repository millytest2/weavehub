import { ResearchFeed } from "@/components/lab/ResearchFeed";

const Research = () => {
  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
      <div className="max-w-lg mx-auto space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-display font-semibold">Research</h1>
          <p className="text-sm text-muted-foreground/40">
            Fresh reads pulled to what you're building right now
          </p>
        </div>
        <ResearchFeed />
      </div>
    </div>
  );
};

export default Research;
