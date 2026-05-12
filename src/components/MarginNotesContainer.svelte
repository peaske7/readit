<script lang="ts">
import type { Cluster } from "../lib/clustering";
import type { Positions } from "../lib/positions";
import MarginCluster from "./MarginCluster.svelte";

interface Props {
  clusters: Cluster[];
  positions: Positions;
}

let { clusters, positions }: Props = $props();

function startIndexFor(idx: number): number {
  let n = 0;
  for (let i = 0; i < idx; i++) n += clusters[i].comments.length;
  return n;
}
</script>

{#if clusters.length > 0}
  <div class="relative w-full">
    {#each clusters as cluster, i (cluster.id)}
      <MarginCluster
        {cluster}
        startIndex={startIndexFor(i)}
        {positions}
      />
    {/each}
  </div>
{/if}
