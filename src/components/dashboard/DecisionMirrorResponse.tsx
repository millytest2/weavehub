import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DecisionMirrorResponseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mirror: string;
}

export const DecisionMirrorResponse = ({ open, onOpenChange, mirror }: DecisionMirrorResponseProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium">Decision Mirror</DialogTitle>
          <DialogDescription className="sr-only">Identity reflection for your decision</DialogDescription>
        </DialogHeader>
        
        <div className="py-6">
          <p className="text-lg leading-relaxed text-foreground font-medium">
            {mirror}
          </p>
        </div>
        
        <Button 
          onClick={() => onOpenChange(false)} 
          variant="outline" 
          className="w-full"
        >
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
};
