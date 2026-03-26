import { useCommentContext } from "../contexts/CommentContext";
import { useLocale } from "../contexts/LocaleContext";
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
  const { t } = useLocale();

  return (
    <header className="sticky top-0 z-50 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-100 dark:border-zinc-800">
      <div className="px-6 py-3 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Text variant="title" as="h1">
            readit
          </Text>
          <span className="text-zinc-200 dark:text-zinc-700 font-light">—</span>
          <Text variant="caption" as="span" className="truncate max-w-[200px]">
            {fileName}
          </Text>
        </div>

        <div className="flex items-center gap-3">
          {reanchorTarget && (
            <Text variant="caption" as="span" className="italic">
              {t("header.selectTextToReanchor")}
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
