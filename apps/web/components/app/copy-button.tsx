"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface CopyButtonProps {
  code: string;
}

const CopyButton = ({ code }: CopyButtonProps) => {
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast("Copied to clipboard.");
    } catch {
      toast.error("Failed to copy.");
    }
  };

  return (
    <Button
      size="icon"
      variant="ghost"
      className="absolute top-2 right-2 z-10 h-7 w-7 text-muted-foreground hover:text-foreground"
      onClick={handleCopy}
      aria-label="Copy code to clipboard"
    >
      <Copy className="h-3.5 w-3.5" />
    </Button>
  );
};

export { CopyButton };
