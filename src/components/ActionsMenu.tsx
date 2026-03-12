import { Maximize2, Minimize2, MoreHorizontal, Settings } from "lucide-react";
import { useState } from "react";
import { useCommentContext } from "../contexts/CommentContext";
import { useLayoutContext } from "../contexts/LayoutContext";
import { RawModal } from "./RawModal";
import { SettingsModal } from "./SettingsModal";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

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
            aria-label="Actions menu"
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[160px]">
          <DropdownMenuItem onSelect={() => toggleLayoutMode()}>
            {isFullscreen ? <Minimize2 /> : <Maximize2 />}
            {isFullscreen ? "Centered" : "Fullscreen"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
            <Settings />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onReload()}>
            Reload
          </DropdownMenuItem>
          {commentCount > 0 && (
            <>
              <DropdownMenuItem
                onSelect={() => onCopyAll()}
                title="Copy in prompt format for AI assistants"
              >
                Copy All (AI)
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onCopyAllRaw()}
                title="Copy as plain text"
              >
                Copy All (Raw)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onExportJson()}>
                Export JSON
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setRawModalOpen(true)}>
                View Raw
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
