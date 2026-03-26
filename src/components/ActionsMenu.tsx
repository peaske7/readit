import {
  ClipboardCopy,
  FileDown,
  FileText,
  MoreHorizontal,
  RefreshCw,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { useCommentData } from "../contexts/CommentContext";
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
  onExportJson: () => void;
  onReload: () => void;
}

export function ActionsMenu({
  onCopyAll,
  onExportJson,
  onReload,
}: ActionsMenuProps) {
  const { commentCount } = useCommentData();
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
              <DropdownMenuItem onSelect={() => onCopyAll()}>
                <ClipboardCopy />
                {t("actions.copyAll")}
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
