import {
  BotMessageSquare,
  FileDown,
  FileText,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  RefreshCw,
  Settings,
  TextQuote,
} from "lucide-react";
import { useState } from "react";
import { useCommentContext } from "../contexts/CommentContext";
import { useLayoutContext } from "../contexts/LayoutContext";
import { useLocale } from "../contexts/LocaleContext";
import { RawModal } from "./RawModal";
import { SettingsModal } from "./SettingsModal";
import { Button } from "./ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/DropdownMenu";

interface ActionsMenuProps {
  onCopyAll: () => void;
  onCopyAllRaw: () => void;
  onExportJson: () => void;
  onReload: () => void;
}

export function ActionsMenu({
  onCopyAll,
  onCopyAllRaw,
  onExportJson,
  onReload,
}: ActionsMenuProps) {
  const { commentCount } = useCommentContext();
  const { isFullscreen, toggleLayoutMode } = useLayoutContext();
  const { t } = useLocale();

  const [menuOpen, setMenuOpen] = useState(false);
  const [rawModalOpen, setRawModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t("actions.ariaLabel")}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[160px]">
          <DropdownMenuItem onSelect={() => toggleLayoutMode()}>
            {isFullscreen ? <Minimize2 /> : <Maximize2 />}
            {isFullscreen ? t("actions.centered") : t("actions.fullscreen")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
            <Settings />
            {t("actions.settings")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onReload()}>
            <RefreshCw />
            {t("actions.reload")}
          </DropdownMenuItem>
          {commentCount > 0 && (
            <>
              <DropdownMenuItem
                onSelect={() => onCopyAll()}
                title={t("actions.copyAllAITitle")}
              >
                <BotMessageSquare />
                {t("actions.copyAllAI")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onCopyAllRaw()}
                title={t("actions.copyAllRawTitle")}
              >
                <TextQuote />
                {t("actions.copyAllRaw")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onExportJson()}>
                <FileDown />
                {t("actions.exportJson")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setRawModalOpen(true)}>
                <FileText />
                {t("actions.viewRaw")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <RawModal isOpen={rawModalOpen} onClose={() => setRawModalOpen(false)} />

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}
