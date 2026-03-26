import { Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocale } from "../contexts/LocaleContext";
import { useAppStore } from "../store";
import { Button } from "./ui/Button";
import {
  Dialog,
  DialogBody,
  DialogContent,
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
  const { t } = useLocale();
  const [state, setState] = useState<ModalState>({ status: "idle" });
  const activeDocumentPath = useAppStore((s) => s.activeDocumentPath);

  // Fetch raw comments when modal opens
  useEffect(() => {
    if (!isOpen) {
      setState({ status: "idle" });
      return;
    }

    setState({ status: "loading" });

    const fetchRawComments = async () => {
      try {
        const query = activeDocumentPath
          ? `?path=${encodeURIComponent(activeDocumentPath)}`
          : "";
        const response = await fetch(`/api/comments/raw${query}`);
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
  }, [isOpen, activeDocumentPath]);

  const handleCopy = useCallback(async () => {
    if (state.status !== "success") return;

    try {
      await navigator.clipboard.writeText(state.content);
      toast.success(t("rawModal.copiedToClipboard"));
    } catch {
      toast.error(t("rawModal.failedToCopy"));
    }
  }, [state, t]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[80vh]" onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{t("rawModal.title")}</DialogTitle>
          {state.status === "success" && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleCopy}
              title={t("rawModal.copyTitle")}
            >
              <Copy className="w-4 h-4" />
            </Button>
          )}
        </DialogHeader>

        {(state.status === "success" || state.status === "empty") && (
          <div className="px-4 py-2 border-b border-zinc-50 dark:border-zinc-800 text-xs text-zinc-400 dark:text-zinc-500 font-mono truncate">
            {state.path}
          </div>
        )}

        <DialogBody>
          {state.status === "loading" && (
            <Text variant="caption" className="text-center py-8">
              {t("rawModal.loading")}
            </Text>
          )}

          {state.status === "error" && (
            <Text variant="body" className="text-red-500 text-center py-8">
              {state.error}
            </Text>
          )}

          {state.status === "empty" && (
            <Text variant="caption" className="text-center py-8">
              {t("rawModal.noComments")}
            </Text>
          )}

          {state.status === "success" && (
            <Text variant="body" as="pre" className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
              {state.content}
            </Text>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
