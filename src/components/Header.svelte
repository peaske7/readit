<script lang="ts">
import type { Comment } from "../schema";
import { t } from "../stores/locale.svelte";
import ActionsMenu from "./ActionsMenu.svelte";
import CommentBadge from "./CommentBadge.svelte";
import Text from "./ui/Text.svelte";

interface Props {
  fileName: string;
  comments: Comment[];
  hasReanchorTarget: boolean;
  oncopyall: () => void;
  onexportjson: () => void;
  onreload: () => void;
  onedit: (id: string, newText: string) => void;
  ondelete: (id: string) => void;
  ondeleteall: () => void;
  onnavigate: (id: string) => void;
  onstartreanchor: (id: string) => void;
}

let {
  fileName,
  comments,
  hasReanchorTarget,
  oncopyall,
  onexportjson,
  onreload,
  onedit,
  ondelete,
  ondeleteall,
  onnavigate,
  onstartreanchor,
}: Props = $props();

let commentCount = $derived(comments.length);
</script>

<header class="sticky top-0 z-50 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-100 dark:border-zinc-800">
  <div class="px-6 py-3 flex items-center justify-between max-w-7xl mx-auto">
    <div class="flex items-center gap-3">
      <Text variant="title" as="h1">
        readit
      </Text>
      <span class="text-zinc-200 dark:text-zinc-700 font-light">&mdash;</span>
      <Text variant="caption" as="span" class="truncate max-w-[200px]">
        {fileName}
      </Text>
    </div>

    <div class="flex items-center gap-3">
      {#if hasReanchorTarget}
        <Text variant="caption" as="span" class="italic">
          {t("header.selectTextToReanchor")}
        </Text>
      {/if}

      <CommentBadge
        {comments}
        {fileName}
        {onedit}
        {ondelete}
        {ondeleteall}
        {onnavigate}
        {onstartreanchor}
      />

      <ActionsMenu
        {commentCount}
        {oncopyall}
        {onexportjson}
        {onreload}
      />
    </div>
  </div>
</header>
