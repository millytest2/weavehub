import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FlaskConical, ArrowRight, Sparkles } from "lucide-react";

interface ExperimentConnectionProps {
  experiment: {
    id: string;
    title: string;
    description?: string;
    identity_shift_target?: string;
    status?: string;
    duration?: string;
  } | null;
  currentTask?: {
    pillar?: string;
    one_thing?: string;
  } | null;
}

export const ExperimentConnection = ({ experiment, currentTask }: ExperimentConnectionProps) => {
  const navigate = useNavigate();

  if (!experiment) {
    return (
      <Card className="border-border/30 border-dashed">
        <CardContent className="py-6 text-center space-y-3">
          <FlaskConical className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <div>
            <p className="text-sm text-muted-foreground">No active experiment</p>
            <p className="text-xs text-muted-foreground mt-1">
              Experiments help you test identity shifts
            </p>
          </div>
          <Button
            onClick={() => navigate("/experiments")}
            variant="outline"
            size="sm"
          >
            Start One
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Check if current task relates to experiment
  const isConnected = currentTask?.pillar && experiment.title.toLowerCase().includes(currentTask.pillar.toLowerCase());

  return (
    <Card className="border-border/30 overflow-hidden">
      {/* Connection indicator */}
      {isConnected && (
        <div className="bg-primary/10 px-4 py-2 flex items-center gap-2">
          <Sparkles className="h-3 w-3 text-primary" />
          <span className="text-xs text-primary font-medium">
            Today's action connects to this experiment
          </span>
        </div>
      )}
      
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          Running Experiment
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <div>
          <h3 className="font-semibold text-base">{experiment.title}</h3>
          {experiment.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {experiment.description}
            </p>
          )}
        </div>

        {/* Identity shift target */}
        {experiment.identity_shift_target && (
          <div className="p-3 rounded-lg bg-gradient-to-r from-primary/5 to-transparent border-l-2 border-primary">
            <p className="text-xs text-muted-foreground mb-1">Becoming:</p>
            <p className="text-sm font-medium">{experiment.identity_shift_target}</p>
          </div>
        )}

        {/* Duration */}
        {experiment.duration && (
          <p className="text-xs text-muted-foreground">
            Duration: {experiment.duration}
          </p>
        )}

        <Button
          onClick={() => navigate("/experiments")}
          variant="ghost"
          size="sm"
          className="w-full justify-between"
        >
          View Details
          <ArrowRight className="h-3 w-3" />
        </Button>
      </CardContent>
    </Card>
  );
};
