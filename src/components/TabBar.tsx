import { X } from "lucide-react";
import { cn } from "../lib/utils";
import { useAppStore } from "../store";

export function TabBar() {
  const documentOrder = useAppStore((s) => s.documentOrder);
  const activeDocumentPath = useAppStore((s) => s.activeDocumentPath);
  const documents = useAppStore((s) => s.documents);
  const setActiveDocument = useAppStore((s) => s.setActiveDocument);
  const closeDocument = useAppStore((s) => s.closeDocument);

  if (documentOrder.length <= 1) return null;

  return (
    <div
      className="flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-2 overflow-x-auto"
      role="tablist"
    >
      {documentOrder.map((filePath) => {
        const docState = documents.get(filePath);
        if (!docState) return null;
        const isActive = filePath === activeDocumentPath;

        return (
          <div
            key={filePath}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            aria-selected={isActive}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm border-b-2 whitespace-nowrap cursor-pointer select-none",
              isActive
                ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
            )}
            onClick={() => setActiveDocument(filePath)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setActiveDocument(filePath);
              }
            }}
          >
            <span>{docState.document.fileName}</span>
            <button
              type="button"
              className="ml-1 rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              onClick={(e) => {
                e.stopPropagation();
                closeDocument(filePath);
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
