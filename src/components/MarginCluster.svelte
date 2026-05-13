<script lang="ts">
import type { Cluster } from "../lib/clustering";
import { TierTypes } from "../lib/clustering";
import type { Positions } from "../lib/positions";
import MarginEntry from "./MarginEntry.svelte";
import MarginGroupEntry from "./MarginGroupEntry.svelte";

interface Props {
  cluster: Cluster;
  startIndex: number;
  positions: Positions;
}

let { cluster, startIndex, positions }: Props = $props();

let blockEl: HTMLElement | undefined = $state();

$effect(() => {
  if (blockEl) positions.registerCluster(cluster.id, blockEl);
  return () => positions.unregisterCluster(cluster.id);
});
</script>

<div
  bind:this={blockEl}
  class="absolute left-0 right-0 bg-white dark:bg-zinc-900"
  style="visibility: hidden"
  data-cluster-id={cluster.id}
>
  {#if cluster.tier.type === TierTypes.GROUP}
    <MarginGroupEntry comments={cluster.comments} {startIndex} />
  {:else}
    {#each cluster.comments as comment, i (comment.id)}
      <MarginEntry
        {comment}
        index={startIndex + i}
        tier={cluster.tier}
        clusterSize={cluster.comments.length}
      />
    {/each}
  {/if}
</div>
