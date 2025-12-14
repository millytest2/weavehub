import { ExternalLink } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { openUPath } from "@/lib/careerDetection";

interface CareerRedirectPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
}

export function CareerRedirectPrompt({ 
  open, 
  onOpenChange, 
  onContinue 
}: CareerRedirectPromptProps) {
  const handleVisitUPath = () => {
    openUPath();
    onOpenChange(false);
  };

  const handleContinue = () => {
    onContinue();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg">Career clarity on your mind?</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            Weave is for daily alignment. UPath is designed specifically for career exploration, 
            finding your path, and mapping your next move.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={handleContinue} className="w-full sm:w-auto">
            Save in Weave
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleVisitUPath} className="w-full sm:w-auto gap-2">
            Try UPath
            <ExternalLink className="h-4 w-4" />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
