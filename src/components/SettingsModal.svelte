<script lang="ts">
import { Check, ChevronDown } from "lucide-svelte";
import { type Locale, Locales } from "../lib/i18n";
import { cn } from "../lib/utils";
import { type FontFamily, FontFamilies, ThemeModes } from "../schema";
import { localeState, setLocale, t } from "../stores/locale.svelte";
import {
  settings,
  updateFontFamily,
  updateThemeMode,
} from "../stores/settings.svelte";
import Dialog from "./ui/Dialog.svelte";
import DropdownMenu from "./ui/DropdownMenu.svelte";
import DropdownMenuItem from "./ui/DropdownMenuItem.svelte";
import Text from "./ui/Text.svelte";
import ShortcutList from "./ShortcutList.svelte";

interface Props {
  open: boolean;
  onclose: () => void;
}

let { open = $bindable(false), onclose }: Props = $props();

const LOCALE_OPTIONS = [
  { value: Locales.JA, label: "日本語" },
  { value: Locales.EN, label: "English" },
] as const;

let themeOptions = $derived([
  { value: ThemeModes.SYSTEM, label: t("settings.theme.system") },
  { value: ThemeModes.LIGHT, label: t("settings.theme.light") },
  { value: ThemeModes.DARK, label: t("settings.theme.dark") },
]);

let fontOptions = $derived([
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
]);

let activeTheme = $derived(
  themeOptions.find((o) => o.value === settings.themeMode) ?? themeOptions[0],
);
let activeFont = $derived(
  fontOptions.find((o) => o.value === settings.fontFamily) ?? fontOptions[0],
);
let activeLocale = $derived(
  LOCALE_OPTIONS.find((o) => o.value === localeState.locale) ??
    LOCALE_OPTIONS[0],
);

const triggerClassName = cn(
  "inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm",
  "border border-zinc-200 dark:border-zinc-700",
  "bg-white dark:bg-zinc-800",
  "text-zinc-700 dark:text-zinc-300",
  "hover:bg-zinc-50 dark:hover:bg-zinc-700/50",
  "transition-colors cursor-pointer",
);

let themeDropdownOpen = $state(false);
let fontDropdownOpen = $state(false);
let localeDropdownOpen = $state(false);
</script>

<Dialog bind:open {onclose} contentClass="max-w-md">
  {#snippet header()}
    {t("settings.title")}
  {/snippet}

  <div class="space-y-4">
    <div>
      <Text variant="overline" as="h3" class="mb-3">
        {t("settings.theme")}
      </Text>
      <DropdownMenu bind:open={themeDropdownOpen} align="start" contentClass="min-w-[160px]">
        {#snippet trigger()}
          <button type="button" class={triggerClassName}>
            {#if activeTheme.value === ThemeModes.SYSTEM}
              <span
                class="size-2.5 rounded-full bg-gradient-to-r from-amber-400 to-indigo-400"
              ></span>
            {:else}
              <span
                class={cn(
                  "size-2.5 rounded-full",
                  activeTheme.value === ThemeModes.LIGHT
                    ? "bg-amber-400"
                    : "bg-indigo-400",
                )}
              ></span>
            {/if}
            <span
              class="text-[10px] font-semibold leading-none text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded px-1 py-0.5"
            >Aa</span>
            <span>{activeTheme.label}</span>
            <ChevronDown class="size-3 text-zinc-400 dark:text-zinc-500" />
          </button>
        {/snippet}

        {#each themeOptions as option (option.value)}
          <DropdownMenuItem
            onselect={() => {
              updateThemeMode(option.value);
              themeDropdownOpen = false;
            }}
            class="flex items-center gap-2"
          >
            {#if option.value === ThemeModes.SYSTEM}
              <span
                class="size-2.5 rounded-full bg-gradient-to-r from-amber-400 to-indigo-400"
              ></span>
            {:else}
              <span
                class={cn(
                  "size-2.5 rounded-full",
                  option.value === ThemeModes.LIGHT
                    ? "bg-amber-400"
                    : "bg-indigo-400",
                )}
              ></span>
            {/if}
            <span
              class="text-[10px] font-semibold leading-none text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded px-1 py-0.5"
            >Aa</span>
            <span class="flex-1">{option.label}</span>
            {#if settings.themeMode === option.value}
              <Check class="size-3.5 text-zinc-500 dark:text-zinc-400" />
            {/if}
          </DropdownMenuItem>
        {/each}
      </DropdownMenu>
    </div>

    <div>
      <Text variant="overline" as="h3" class="mb-3">
        {t("settings.font")}
      </Text>
      <DropdownMenu bind:open={fontDropdownOpen} align="start" contentClass="min-w-[160px]">
        {#snippet trigger()}
          <button type="button" class={triggerClassName}>
            <span
              class={cn(
                "text-[10px] font-semibold leading-none text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded px-1 py-0.5",
                activeFont.fontClass,
              )}
            >Aa</span>
            <span>{activeFont.label}</span>
            <ChevronDown class="size-3 text-zinc-400 dark:text-zinc-500" />
          </button>
        {/snippet}

        {#each fontOptions as option (option.value)}
          <DropdownMenuItem
            onselect={() => {
              updateFontFamily(option.value as FontFamily);
              fontDropdownOpen = false;
            }}
            class="flex items-center gap-2"
          >
            <span
              class={cn(
                "text-[10px] font-semibold leading-none text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded px-1 py-0.5",
                option.fontClass,
              )}
            >Aa</span>
            <span class="flex-1">{option.label}</span>
            {#if settings.fontFamily === option.value}
              <Check class="size-3.5 text-zinc-500 dark:text-zinc-400" />
            {/if}
          </DropdownMenuItem>
        {/each}
      </DropdownMenu>
    </div>

    <div>
      <Text variant="overline" as="h3" class="mb-3">
        {t("settings.language")}
      </Text>
      <DropdownMenu bind:open={localeDropdownOpen} align="start" contentClass="min-w-[160px]">
        {#snippet trigger()}
          <button type="button" class={triggerClassName}>
            <span>{activeLocale.label}</span>
            <ChevronDown class="size-3 text-zinc-400 dark:text-zinc-500" />
          </button>
        {/snippet}

        {#each LOCALE_OPTIONS as option (option.value)}
          <DropdownMenuItem
            onselect={() => {
              setLocale(option.value as Locale);
              localeDropdownOpen = false;
            }}
            class="flex items-center gap-2"
          >
            <span class="flex-1">{option.label}</span>
            {#if localeState.locale === option.value}
              <Check class="size-3.5 text-zinc-500 dark:text-zinc-400" />
            {/if}
          </DropdownMenuItem>
        {/each}
      </DropdownMenu>
    </div>

    <div>
      <Text variant="overline" as="h3" class="mb-3">
        {t("shortcuts.title")}
      </Text>
      <ShortcutList />
    </div>
  </div>
</Dialog>
