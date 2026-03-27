<script lang="ts">
import { Copy } from "lucide-svelte";
import { app } from "../stores/app.svelte";
import { t } from "../stores/locale.svelte";
import Button from "./ui/Button.svelte";
import Dialog from "./ui/Dialog.svelte";
import Text from "./ui/Text.svelte";

interface Props {
  open: boolean;
  onclose: () => void;
}

let { open = $bindable(false), onclose }: Props = $props();

type ModalState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "empty"; path: string }
  | { status: "success"; content: string; path: string };

let modalState = $state<ModalState>({ status: "idle" });

$effect(() => {
  if (!open) {
    modalState = { status: "idle" };
    return;
  }

  modalState = { status: "loading" };

  const query = app.activeDocumentPath
    ? `?path=${encodeURIComponent(app.activeDocumentPath)}`
    : "";

  fetch(`/api/comments/raw${query}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Failed to fetch raw comments");
      }
      return response.json();
    })
    .then((result) => {
      if (result.content === null) {
        modalState = { status: "empty", path: result.path };
      } else {
        modalState = {
          status: "success",
          content: result.content,
          path: result.path,
        };
      }
    })
    .catch((err) => {
      modalState = {
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    });
});

async function handleCopy() {
  if (modalState.status !== "success") return;

  try {
    await navigator.clipboard.writeText(modalState.content);
  } catch {
    // Copy failed silently
  }
}
</script>

<Dialog bind:open {onclose} contentClass="max-w-2xl max-h-[80vh]">
  {#snippet header()}
    {t("rawModal.title")}
  {/snippet}

  {#snippet headerActions()}
    {#if modalState.status === "success"}
      <Button
        variant="ghost"
        size="icon"
        class="size-7"
        onclick={handleCopy}
        title={t("rawModal.copyTitle")}
      >
        <Copy class="w-4 h-4" />
      </Button>
    {/if}
  {/snippet}

  {#if modalState.status === "success" || modalState.status === "empty"}
    <div
      class="px-4 py-2 border-b border-zinc-50 dark:border-zinc-800 text-xs text-zinc-400 dark:text-zinc-500 font-mono truncate -mt-4 -mx-4 mb-4"
    >
      {modalState.path}
    </div>
  {/if}

  {#if modalState.status === "loading"}
    <Text variant="caption" class="text-center py-8">
      {t("rawModal.loading")}
    </Text>
  {/if}

  {#if modalState.status === "error"}
    <Text variant="body" class="text-red-500 text-center py-8">
      {modalState.error}
    </Text>
  {/if}

  {#if modalState.status === "empty"}
    <Text variant="caption" class="text-center py-8">
      {t("rawModal.noComments")}
    </Text>
  {/if}

  {#if modalState.status === "success"}
    <Text
      variant="body"
      as="pre"
      class="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed"
    >
      {modalState.content}
    </Text>
  {/if}
</Dialog>
