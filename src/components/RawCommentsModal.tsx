import { Copy, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface RawCommentsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RawCommentsData {
  content: string | null;
  path: string;
}

export function RawCommentsModal({ isOpen, onClose }: RawCommentsModalProps) {
  const [data, setData] = useState<RawCommentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch raw comments when modal opens
  useEffect(() => {
    if (!isOpen) {
      setData(null);
      setLoading(true);
      setError(null);
      return;
    }

    const fetchRawComments = async () => {
      try {
        const response = await fetch("/api/comments/raw");
        if (!response.ok) {
          throw new Error("Failed to fetch raw comments");
        }
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
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
    if (!data?.content) return;

    try {
      await navigator.clipboard.writeText(data.content);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }, [data?.content]);

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
            {data?.content && (
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
        {data?.path && (
          <div className="px-4 py-2 border-b border-gray-50 text-xs text-gray-400 font-mono truncate">
            {data.path}
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="text-sm text-gray-400 text-center py-8">
              Loading...
            </div>
          )}

          {error && (
            <div className="text-sm text-red-500 text-center py-8">{error}</div>
          )}

          {!loading && !error && data?.content === null && (
            <div className="text-sm text-gray-400 text-center py-8">
              No comments file yet. Add comments to create one.
            </div>
          )}

          {!loading && !error && data?.content && (
            <pre className="text-xs text-gray-600 font-mono whitespace-pre-wrap break-words leading-relaxed">
              {data.content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
