import { useCommentContext } from "../contexts/CommentContext";
import { useLayoutContext } from "../contexts/LayoutContext";
import { cn } from "../lib/utils";
import { ActionsMenu } from "./ActionsMenu";
import { CommentBadge } from "./comments/CommentBadge";
import { Text } from "./ui/Text";

interface HeaderProps {
  fileName: string;
  onCopyAll: () => void;
  onCopyAllRaw: () => void;
  onExportJson: () => void;
  onReload: () => void;
}

export function Header({
  fileName,
  onCopyAll,
  onCopyAllRaw,
  onExportJson,
  onReload,
}: HeaderProps) {
  const { reanchorTarget } = useCommentContext();
  const { isFullscreen } = useLayoutContext();

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-zinc-100">
      <div
        className={cn(
          "px-6 py-3 flex items-center justify-between",
          !isFullscreen && "max-w-7xl mx-auto",
        )}
      >
        <div className="flex items-center gap-3">
          <Text variant="title" asChild>
            <h1 className="font-serif">readit</h1>
          </Text>
          <span className="text-zinc-200 font-light">—</span>
          <Text variant="caption" asChild>
            <span className="font-serif truncate max-w-[200px]">
              {fileName}
            </span>
          </Text>
        </div>

        <div className="flex items-center gap-3">
          {reanchorTarget && (
            <Text variant="caption" asChild>
              <span className="italic">Select text to re-anchor</span>
            </Text>
          )}

          <CommentBadge />

          <ActionsMenu
            onCopyAll={onCopyAll}
            onCopyAllRaw={onCopyAllRaw}
            onExportJson={onExportJson}
            onReload={onReload}
          />
        </div>
      </div>
    </header>
  );
}
