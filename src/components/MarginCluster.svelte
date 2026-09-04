<script lang="ts">
import { GeometryAttributes } from "../lib/geometry/attributes";
import { type Cluster, TierTypes } from "../lib/geometry/clustering";
import type { DocumentGeometry } from "../lib/geometry/document-geometry";
import MarginEntry from "./MarginEntry.svelte";
import MarginGroupEntry from "./MarginGroupEntry.svelte";

interface Props {
  cluster: Cluster;
  startIndex: number;
  geometry: DocumentGeometry;
}

let { cluster, startIndex, geometry }: Props = $props();

let blockEl: HTMLElement | undefined = $state();

$effect(() => {
  if (blockEl) geometry.registerCluster(cluster.id, blockEl);
  return () => geometry.unregisterCluster(cluster.id);
});
</script>

<div
  bind:this={blockEl}
  class="absolute left-0 right-0 bg-white dark:bg-zinc-900"
  style="visibility: hidden"
  {...{ [GeometryAttributes.CLUSTER_ID]: cluster.id }}
>
  {#if cluster.tier.type === TierTypes.GROUP}
    <MarginGroupEntry
      comments={cluster.comments}
      {startIndex}
      tier={cluster.tier}
    />
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
