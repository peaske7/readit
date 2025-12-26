import { Copy, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface RawCommentsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "empty"; path: string }
  | { status: "success"; content: string; path: string };

export function RawCommentsModal({ isOpen, onClose }: RawCommentsModalProps) {
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

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleCopy = useCallback(async () => {
    if (state.status !== "success") return;

    try {
      await navigator.clipboard.writeText(state.content);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }, [state]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/20 backdrop-blur-sm cursor-default"
        onClick={onClose}
        aria-label="Close modal"
      />

      {/* Modal */}
      <div
        className="relative bg-white rounded-lg shadow-lg shadow-gray-200/50 border border-gray-100 w-full max-w-2xl max-h-[80vh] flex flex-col animate-in"
        role="dialog"
        aria-label="Raw comments file"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-serif text-sm text-gray-900">Raw Comments</h2>
          <div className="flex items-center gap-2">
            {state.status === "success" && (
              <button
                type="button"
                onClick={handleCopy}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* File path subtitle */}
        {(state.status === "success" || state.status === "empty") && (
          <div className="px-4 py-2 border-b border-gray-50 text-xs text-gray-400 font-mono truncate">
            {state.path}
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-auto p-4">
          {state.status === "loading" && (
            <div className="text-sm text-gray-400 text-center py-8">
              Loading...
            </div>
          )}

          {state.status === "error" && (
            <div className="text-sm text-red-500 text-center py-8">
              {state.error}
            </div>
          )}

          {state.status === "empty" && (
            <div className="text-sm text-gray-400 text-center py-8">
              No comments file yet. Add comments to create one.
            </div>
          )}

          {state.status === "success" && (
            <pre className="text-xs text-gray-600 font-mono whitespace-pre-wrap break-words leading-relaxed">
              {state.content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
