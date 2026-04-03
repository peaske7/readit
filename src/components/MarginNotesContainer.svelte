<script lang="ts">
import type { Positions } from "../lib/positions";
import type { Comment } from "../schema";
import MarginNote from "./MarginNote.svelte";

interface Props {
  sortedComments: Comment[];
  positions: Positions;
  onedit: (id: string, text: string) => void;
  ondelete: (id: string) => void;
  oncopy: (comment: Comment) => void;
  onnavigate: (commentId: string) => void;
}

let { sortedComments, positions, onedit, ondelete, oncopy, onnavigate }: Props =
  $props();
</script>

{#if sortedComments.length > 0}
  <div class="relative w-64">
    {#each sortedComments as comment, index (comment.id)}
      <MarginNote
        {comment}
        commentIndex={index}
        {positions}
        {onedit}
        {ondelete}
        {oncopy}
        {onnavigate}
      />
    {/each}
  </div>
{/if}
