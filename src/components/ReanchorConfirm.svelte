<script lang="ts">
import { t } from "../stores/locale.svelte";
import Button from "./ui/Button.svelte";
import Text from "./ui/Text.svelte";

interface Props {
  selectionText: string;
  onconfirm: () => void;
  oncancel: () => void;
}

let { selectionText, onconfirm, oncancel }: Props = $props();
</script>

<div class="border-t border-zinc-200 dark:border-zinc-700 pt-2 pb-3 pl-6">
  <Text variant="body" class="mb-2">
    {t("reanchor.question")}
  </Text>
  <Text variant="caption" class="italic line-clamp-2 mb-2">
    "{selectionText}"
  </Text>
  <div class="flex gap-3 text-sm">
    <Button variant="link" size="sm" onclick={onconfirm}>
      {t("reanchor.confirm")}
    </Button>
    <Button variant="ghost" size="sm" onclick={oncancel}>
      {t("reanchor.cancel")}
    </Button>
  </div>
</div>
