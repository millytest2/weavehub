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
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Exploring Career Direction?</AlertDialogTitle>
          <AlertDialogDescription>
            For guided career path exploration and finding your professional direction, 
            check out upath.ai - built specifically to help you navigate career decisions.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleContinue}>
            Continue Here
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleVisitUPath} className="gap-2">
            Visit upath.ai
            <ExternalLink className="h-4 w-4" />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
