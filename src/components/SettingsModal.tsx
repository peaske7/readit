import { Check, ChevronDown } from "lucide-react";
import { useLayoutContext } from "../contexts/LayoutContext";
import { cn } from "../lib/utils";
import {
  FontFamilies,
  type FontFamily,
  type ThemeMode,
  ThemeModes,
} from "../types";
import { ShortcutList } from "./ShortcutList";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/Dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/DropdownMenu";
import { Text, textVariants } from "./ui/Text";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const THEME_OPTIONS = [
  { value: ThemeModes.SYSTEM, label: "System" },
  { value: ThemeModes.LIGHT, label: "Light" },
  { value: ThemeModes.DARK, label: "Dark" },
] as const;

function ThemeDot({
  mode,
  className,
}: {
  mode: ThemeMode;
  className?: string;
}) {
  if (mode === ThemeModes.SYSTEM) {
    return (
      <span
        className={cn(
          "size-2.5 rounded-full bg-gradient-to-r from-amber-400 to-indigo-400",
          className,
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        "size-2.5 rounded-full",
        mode === ThemeModes.LIGHT ? "bg-amber-400" : "bg-indigo-400",
        className,
      )}
    />
  );
}

function ThemePreviewBadge() {
  return (
    <span className="text-[10px] font-semibold leading-none text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded px-1 py-0.5">
      Aa
    </span>
  );
}

/* ─── Font selector ──────────────────────────────────────────── */

const FONT_OPTIONS = [
  { value: FontFamilies.SERIF, label: "Serif", fontClass: "font-serif" },
  {
    value: FontFamilies.SANS_SERIF,
    label: "Sans-serif",
    fontClass: "font-sans",
  },
] as const;

function FontPreviewBadge({ fontClass }: { fontClass: string }) {
  return (
    <span
      className={cn(
        "text-[10px] font-semibold leading-none text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded px-1 py-0.5",
        fontClass,
      )}
    >
      Aa
    </span>
  );
}

/* ─── Shared trigger style ───────────────────────────────────── */

const triggerClassName = cn(
  "inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm",
  "border border-zinc-200 dark:border-zinc-700",
  "bg-white dark:bg-zinc-800",
  "text-zinc-700 dark:text-zinc-300",
  "hover:bg-zinc-50 dark:hover:bg-zinc-700/50",
  "transition-colors cursor-pointer",
);

/* ─── Settings Modal ─────────────────────────────────────────── */

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const {
    fontFamily,
    setFontFamily,
    themeMode,
    setThemeMode,
    shortcuts,
    updateBinding,
    toggleShortcutEnabled,
    resetShortcutsToDefaults,
  } = useLayoutContext();

  const activeTheme =
    THEME_OPTIONS.find((o) => o.value === themeMode) ?? THEME_OPTIONS[0];
  const activeFont =
    FONT_OPTIONS.find((o) => o.value === fontFamily) ?? FONT_OPTIONS[0];

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div>
            <Text variant="overline" asChild>
              <h3 className="mb-3">Theme</h3>
            </Text>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={triggerClassName}>
                  <ThemeDot mode={activeTheme.value} />
                  <ThemePreviewBadge />
                  <span>{activeTheme.label}</span>
                  <ChevronDown className="size-3 text-zinc-400 dark:text-zinc-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[160px]">
                {THEME_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onSelect={() => setThemeMode(option.value)}
                    className="flex items-center gap-2"
                  >
                    <ThemeDot mode={option.value} />
                    <ThemePreviewBadge />
                    <span className="flex-1">{option.label}</span>
                    {themeMode === option.value && (
                      <Check className="size-3.5 text-zinc-500 dark:text-zinc-400" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div>
            <Text variant="overline" asChild>
              <h3 className="mb-3">Font</h3>
            </Text>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={triggerClassName}>
                  <FontPreviewBadge fontClass={activeFont.fontClass} />
                  <span>{activeFont.label}</span>
                  <ChevronDown className="size-3 text-zinc-400 dark:text-zinc-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[160px]">
                {FONT_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onSelect={() => setFontFamily(option.value as FontFamily)}
                    className="flex items-center gap-2"
                  >
                    <FontPreviewBadge fontClass={option.fontClass} />
                    <span className="flex-1">{option.label}</span>
                    {fontFamily === option.value && (
                      <Check className="size-3.5 text-zinc-500 dark:text-zinc-400" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div>
            <Text variant="overline" asChild>
              <h3 className="mb-3">Preview</h3>
            </Text>
            <div
              className={cn(
                textVariants({ variant: "body" }),
                "p-3 rounded-md border border-zinc-100 dark:border-zinc-700 leading-relaxed",
                fontFamily === FontFamilies.SERIF ? "font-serif" : "font-sans",
              )}
            >
              The quick brown fox jumps over the lazy dog. 1234567890
            </div>
          </div>

          <div>
            <Text variant="overline" asChild>
              <h3 className="mb-3">Keyboard Shortcuts</h3>
            </Text>
            <ShortcutList
              shortcuts={shortcuts}
              onUpdateBinding={updateBinding}
              onToggleEnabled={toggleShortcutEnabled}
              onResetToDefaults={resetShortcutsToDefaults}
            />
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
