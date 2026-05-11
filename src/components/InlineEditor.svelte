<script lang="ts">
import { cn } from "../lib/utils";
import { FontFamilies } from "../schema";
import { t } from "../stores/locale.svelte";
import { settings } from "../stores/settings.svelte";
import Button from "./ui/Button.svelte";

interface Props {
  initialText: string;
  onsave: (text: string) => void;
  oncancel: () => void;
  rows?: number;
  class?: string;
}

let {
  initialText,
  onsave,
  oncancel,
  rows = 2,
  class: className,
}: Props = $props();

let fontClass = $derived(
  settings.fontFamily === FontFamilies.SANS_SERIF ? "font-sans" : "font-serif",
);

// svelte-ignore state_referenced_locally — intentionally capture initial prop value
let editText = $state(initialText);
let textareaEl: HTMLTextAreaElement | undefined = $state();

$effect(() => {
  textareaEl?.focus();
});

function handleSave() {
  if (editText.trim()) {
    onsave(editText);
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && e.metaKey) {
    handleSave();
  }
  if (e.key === "Escape") {
    oncancel();
  }
}
</script>

<div class="space-y-2">
  <textarea
    bind:this={textareaEl}
    bind:value={editText}
    class={cn(
      fontClass,
      "w-full px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 resize-none focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500",
      className,
    )}
    {rows}
    onkeydown={handleKeydown}
  ></textarea>
  <div class="flex gap-3 text-sm">
    <Button variant="link" size="sm" onclick={handleSave}>
      {t("editor.save")}
    </Button>
    <Button variant="ghost" size="sm" onclick={oncancel}>
      {t("editor.cancel")}
    </Button>
  </div>
</div>
