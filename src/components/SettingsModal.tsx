import { Check, ChevronDown } from "lucide-react";
import { useSettings } from "../contexts/SettingsContext";
import { useLocale } from "../contexts/LocaleContext";
import { type Locale, Locales } from "../lib/i18n";
import { cn } from "../lib/utils";
import { FontFamilies, type FontFamily, type ThemeMode, ThemeModes } from "../types";
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
import { Text } from "./ui/Text";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LOCALE_OPTIONS = [
  { value: Locales.JA, label: "日本語" },
  { value: Locales.EN, label: "English" },
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

const triggerClassName = cn(
  "inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm",
  "border border-zinc-200 dark:border-zinc-700",
  "bg-white dark:bg-zinc-800",
  "text-zinc-700 dark:text-zinc-300",
  "hover:bg-zinc-50 dark:hover:bg-zinc-700/50",
  "transition-colors cursor-pointer",
);

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { fontFamily, setFontFamily, themeMode, setThemeMode } = useSettings();
  const { locale, setLocale, t } = useLocale();

  const themeOptions = [
    { value: ThemeModes.SYSTEM, label: t("settings.theme.system") },
    { value: ThemeModes.LIGHT, label: t("settings.theme.light") },
    { value: ThemeModes.DARK, label: t("settings.theme.dark") },
  ];

  const fontOptions = [
    {
      value: FontFamilies.SERIF,
      label: t("settings.font.serif"),
      fontClass: "font-serif",
    },
    {
      value: FontFamilies.SANS_SERIF,
      label: t("settings.font.sansSerif"),
      fontClass: "font-sans",
    },
  ];

  const activeTheme =
    themeOptions.find((o) => o.value === themeMode) ?? themeOptions[0];
  const activeFont =
    fontOptions.find((o) => o.value === fontFamily) ?? fontOptions[0];
  const activeLocale =
    LOCALE_OPTIONS.find((o) => o.value === locale) ?? LOCALE_OPTIONS[0];

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div>
            <Text variant="overline" asChild>
              <h3 className="mb-3">{t("settings.theme")}</h3>
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
                {themeOptions.map((option) => (
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
              <h3 className="mb-3">{t("settings.font")}</h3>
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
                {fontOptions.map((option) => (
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
              <h3 className="mb-3">{t("settings.language")}</h3>
            </Text>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={triggerClassName}>
                  <span>{activeLocale.label}</span>
                  <ChevronDown className="size-3 text-zinc-400 dark:text-zinc-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[160px]">
                {LOCALE_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onSelect={() => setLocale(option.value as Locale)}
                    className="flex items-center gap-2"
                  >
                    <span className="flex-1">{option.label}</span>
                    {locale === option.value && (
                      <Check className="size-3.5 text-zinc-500 dark:text-zinc-400" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
