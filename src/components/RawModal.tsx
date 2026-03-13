import { Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/Button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/Dialog";
import { Text } from "./ui/Text";

interface RawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "empty"; path: string }
  | { status: "success"; content: string; path: string };

export function RawModal({ isOpen, onClose }: RawModalProps) {
  const [state, setState] = useState<ModalState>({ status: "idle" });

  // Fetch raw comments when modal opens
  useEffect(() => {
    if (!isOpen) {
      setState({ status: "idle" });
      return;
    }

    setState({ status: "loading" });

    const fetchRawComments = async () => {
      try {
        const response = await fetch("/api/comments/raw");
        if (!response.ok) {
          throw new Error("Failed to fetch raw comments");
        }
        const result = await response.json();
        if (result.content === null) {
          setState({ status: "empty", path: result.path });
        } else {
          setState({
            status: "success",
            content: result.content,
            path: result.path,
          });
        }
      } catch (err) {
        setState({
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    };

    fetchRawComments();
  }, [isOpen]);

  const handleCopy = useCallback(async () => {
    if (state.status !== "success") return;

    try {
      await navigator.clipboard.writeText(state.content);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }, [state]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Raw Comments</DialogTitle>
          {state.status === "success" && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleCopy}
              title="Copy to clipboard"
            >
              <Copy className="w-4 h-4" />
            </Button>
          )}
        </DialogHeader>

        {(state.status === "success" || state.status === "empty") && (
          <DialogDescription className="px-4 py-2 border-b border-zinc-50 text-xs text-zinc-400 font-mono truncate">
            {state.path}
          </DialogDescription>
        )}

        <DialogBody>
          {state.status === "loading" && (
            <Text variant="caption" className="text-center py-8">
              Loading...
            </Text>
          )}

          {state.status === "error" && (
            <Text variant="body" className="text-red-500 text-center py-8">
              {state.error}
            </Text>
          )}

          {state.status === "empty" && (
            <Text variant="caption" className="text-center py-8">
              No comments file yet. Add comments to create one.
            </Text>
          )}

          {state.status === "success" && (
            <Text variant="body" asChild>
              <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
                {state.content}
              </pre>
            </Text>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
