"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { fetchProjectKey, revokeApiKey, regenerateApiKey } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface ApiKeyManagerProps {
  slug: string;
  keyId: string | null;
  projectName: string;
}

const MASKED_BULLETS = "•".repeat(24);

export const ApiKeyManager = ({ slug, keyId, projectName }: ApiKeyManagerProps) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const [newKeyOpen, setNewKeyOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  const maskedKey = keyId ? `lore_${slug}_${MASKED_BULLETS}` : null;

  const handleCopy = async () => {
    if (copying) return;
    setCopying(true);
    try {
      const reference = await fetchProjectKey(slug);
      if (!reference.maskedKey) {
        toast("No active key to copy.");
        return;
      }
      await navigator.clipboard.writeText(reference.maskedKey);
      toast("Copied to clipboard.");
    } catch {
      toast("Action failed. Please try again.");
    } finally {
      setCopying(false);
    }
  };

  const revokeMutation = useMutation({
    mutationFn: () => {
      if (!keyId) {
        return Promise.reject(new Error("No key to revoke"));
      }
      return revokeApiKey(slug, keyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setRevokeOpen(false);
      setSheetOpen(false);
      toast("API key revoked.");
    },
    onError: () => {
      setRevokeOpen(false);
      toast("Action failed. Please try again.");
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateApiKey(slug),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setNewKey(data.key);
      setRegenerateConfirmOpen(false);
      setNewKeyOpen(true);
    },
    onError: () => {
      setRegenerateConfirmOpen(false);
      toast("Action failed. Please try again.");
    },
  });

  const handleCopyAndClose = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    toast("Copied to clipboard.");
    setNewKeyOpen(false);
    setNewKey(null);
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setSheetOpen(true)}
        aria-label={`Manage API keys for ${projectName}`}
        className="focus-visible:ring-2 focus-visible:ring-ring"
      >
        <KeyRound className="mr-1 size-3.5" />
        Keys
      </Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>API Key — {projectName}</SheetTitle>
            <SheetDescription>
              View, copy, regenerate, or revoke the API key for {projectName}. Revoking immediately
              invalidates the key; regenerating replaces it with a new one.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6 px-4">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Active Key
              </p>
              {maskedKey ? (
                <p className="break-all font-mono text-sm text-foreground">{maskedKey}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No active key</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={copying}
                onClick={handleCopy}
                aria-label={`Copy API key reference for ${projectName}`}
                className="w-full justify-start focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Copy className="mr-2 size-3.5" />
                {copying ? "Copying..." : "Copy key reference"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={regenerateMutation.isPending}
                onClick={() => setRegenerateConfirmOpen(true)}
                aria-label={`Regenerate API key for ${projectName}`}
                className="w-full justify-start focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RefreshCw className="mr-2 size-3.5" />
                {regenerateMutation.isPending ? "Regenerating..." : "Regenerate"}
              </Button>

              <Button
                variant="destructive"
                size="sm"
                disabled={!keyId || revokeMutation.isPending}
                onClick={() => setRevokeOpen(true)}
                aria-label={`Revoke API key for ${projectName}`}
                className="w-full justify-start focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 className="mr-2 size-3.5" />
                Revoke
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Revoke API key?</DialogTitle>
            <DialogDescription>
              This will immediately invalidate the key for {projectName}. Agents using this key will
              lose access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={() => revokeMutation.mutate()}
              aria-label={`Confirm revoke API key for ${projectName}`}
            >
              {revokeMutation.isPending ? "Revoking..." : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={regenerateConfirmOpen} onOpenChange={setRegenerateConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Regenerate API key?</DialogTitle>
            <DialogDescription>
              This will replace the active key for {projectName}. Agents using the current key will
              lose access until they are updated with the new key.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenerateConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={regenerateMutation.isPending}
              onClick={() => regenerateMutation.mutate()}
              aria-label={`Confirm regenerate API key for ${projectName}`}
            >
              {regenerateMutation.isPending ? "Regenerating..." : "Regenerate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newKeyOpen}
        onOpenChange={(open) => {
          if (!open) setNewKey(null);
          setNewKeyOpen(open);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>New API Key</DialogTitle>
            <DialogDescription>
              This is the only time this key will be shown. Copy it now.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-muted p-3">
            <code className="break-all font-mono text-xs text-foreground">{newKey}</code>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCopyAndClose}
              className="focus-visible:ring-2 focus-visible:ring-ring"
            >
              Copy and close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
