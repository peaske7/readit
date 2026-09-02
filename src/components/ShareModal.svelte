<script lang="ts">
import { Check, Copy } from "lucide-svelte";
import { apiUrl } from "../lib/api";
import { cn } from "../lib/utils";
import { type ShareMode, ShareModes } from "../schema";
import { app } from "../stores/app.svelte";
import { t } from "../stores/locale.svelte";
import { showToast } from "../stores/toast.svelte";
import Button from "./ui/Button.svelte";
import Dialog from "./ui/Dialog.svelte";
import Text from "./ui/Text.svelte";

interface Props {
  open: boolean;
  onclose: () => void;
}

let { open = $bindable(false), onclose }: Props = $props();

/** Subset of the server's ShareRecord that the dialog shows. */
interface ShareInfo {
  id: string;
  url: string;
  mode: string;
}

type ModalState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "unconfigured" }
  | { status: "ready"; share?: ShareInfo };

let modalState = $state<ModalState>({ status: "loading" });
let mode = $state<ShareMode>(ShareModes.LINK);
let password = $state("");
let busy = $state(false);
let actionError = $state("");
let confirmingUnshare = $state(false);

let share = $derived(
  modalState.status === "ready" ? modalState.share : undefined,
);
let hasStoredPassword = $derived(share?.mode === ShareModes.PASSWORD);

let modeOptions = $derived([
  {
    value: ShareModes.LINK,
    label: t("share.mode.link"),
    hint: t("share.mode.link.hint"),
  },
  {
    value: ShareModes.PUBLIC,
    label: t("share.mode.public"),
    hint: t("share.mode.public.hint"),
  },
  {
    value: ShareModes.PASSWORD,
    label: t("share.mode.password"),
    hint: t("share.mode.password.hint"),
  },
]);

function shareUrl(): string {
  return apiUrl(
    `/api/share?path=${encodeURIComponent(app.activeDocumentPath ?? "")}`,
  );
}

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => undefined);
  return body?.error ?? `${res.status} ${res.statusText}`;
}

$effect(() => {
  if (!open) return;

  modalState = { status: "loading" };
  busy = false;
  actionError = "";
  confirmingUnshare = false;
  password = "";

  fetch(shareUrl())
    .then(async (res) => {
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as {
        configured: boolean;
        share?: ShareInfo;
      };
      if (!data.configured) {
        modalState = { status: "unconfigured" };
        return;
      }
      mode = (data.share?.mode as ShareMode | undefined) ?? ShareModes.LINK;
      modalState = { status: "ready", share: data.share };
    })
    .catch((err) => {
      modalState = {
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    });
});

async function publish() {
  if (busy) return;
  if (mode === ShareModes.PASSWORD && !password && !hasStoredPassword) {
    actionError = t("share.passwordRequired");
    return;
  }

  busy = true;
  actionError = "";
  try {
    const res = await fetch(shareUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, password: password || undefined }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const record = (await res.json()) as ShareInfo;
    modalState = { status: "ready", share: record };
    password = "";
    await copyLink(record.url);
  } catch (err) {
    actionError = err instanceof Error ? err.message : "Unknown error";
  } finally {
    busy = false;
  }
}

async function unshare() {
  if (busy) return;
  busy = true;
  actionError = "";
  try {
    const res = await fetch(shareUrl(), { method: "DELETE" });
    if (!res.ok) throw new Error(await readError(res));
    modalState = { status: "ready" };
    mode = ShareModes.LINK;
  } catch (err) {
    actionError = err instanceof Error ? err.message : "Unknown error";
  } finally {
    busy = false;
    confirmingUnshare = false;
  }
}

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    showToast(t("toast.copiedLink"));
  } catch {}
}

const inputClass = cn(
  "w-full px-2.5 py-1.5 rounded-lg text-sm",
  "border border-zinc-200 dark:border-zinc-700",
  "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
  "focus:outline-none focus:ring-2 focus:ring-blue-500/40",
);
</script>

<Dialog bind:open {onclose} contentClass="max-w-md">
  {#snippet header()}
    {t("share.title")}
  {/snippet}

  {#if modalState.status === "loading"}
    <Text variant="caption">{t("app.loading")}</Text>
  {:else if modalState.status === "error"}
    <Text variant="caption" class="text-red-600 dark:text-red-400">
      {modalState.error}
    </Text>
  {:else if modalState.status === "unconfigured"}
    <Text variant="caption">{t("share.notConfigured")}</Text>
  {:else}
    <div class="space-y-4">
      {#if share}
        <div class="flex items-center gap-2">
          <input
            type="text"
            readonly
            value={share.url}
            class={cn(inputClass, "font-mono text-xs")}
            onfocus={(e) => e.currentTarget.select()}
          />
          <Button
            variant="outline"
            size="sm"
            onclick={() => copyLink(share.url)}
          >
            <Copy class="size-3.5" />
            {t("share.copy")}
          </Button>
        </div>
      {/if}

      <fieldset class="space-y-1" disabled={busy}>
        {#each modeOptions as option (option.value)}
          <label
            class={cn(
              "flex items-start gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
              "hover:bg-zinc-50 dark:hover:bg-zinc-800",
              mode === option.value && "bg-zinc-50 dark:bg-zinc-800",
            )}
          >
            <input
              type="radio"
              name="share-mode"
              value={option.value}
              bind:group={mode}
              class="sr-only"
            />
            <span
              class={cn(
                "mt-0.5 size-4 shrink-0 rounded-full border flex items-center justify-center",
                mode === option.value
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-zinc-300 dark:border-zinc-600",
              )}
            >
              {#if mode === option.value}
                <Check class="size-3" />
              {/if}
            </span>
            <span class="flex flex-col">
              <span class="text-sm text-zinc-900 dark:text-zinc-100">
                {option.label}
              </span>
              <span class="text-xs text-zinc-500 dark:text-zinc-400">
                {option.hint}
              </span>
            </span>
          </label>
        {/each}
      </fieldset>

      {#if mode === ShareModes.PASSWORD}
        <div class="space-y-1">
          <input
            type="password"
            bind:value={password}
            placeholder={t("share.passwordPlaceholder")}
            autocomplete="new-password"
            class={inputClass}
            disabled={busy}
            onkeydown={(e) => {
              if (e.key === "Enter") publish();
            }}
          />
          {#if hasStoredPassword}
            <Text variant="caption">{t("share.passwordKeep")}</Text>
          {/if}
        </div>
      {/if}

      {#if actionError}
        <Text variant="caption" class="text-red-600 dark:text-red-400">
          {actionError}
        </Text>
      {/if}

      <div class="flex items-center justify-between gap-2">
        {#if share}
          {#if confirmingUnshare}
            <div class="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onclick={unshare}
              >
                {t("share.unshareConfirm")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onclick={() => (confirmingUnshare = false)}
              >
                {t("share.unshareCancel")}
              </Button>
            </div>
          {:else}
            <Button
              variant="ghost"
              size="sm"
              class="text-red-600 dark:text-red-400"
              disabled={busy}
              onclick={() => (confirmingUnshare = true)}
            >
              {t("share.unshare")}
            </Button>
          {/if}
        {:else}
          <span></span>
        {/if}

        <Button size="sm" disabled={busy} onclick={publish}>
          {#if busy}
            {t("share.publishing")}
          {:else if share}
            {t("share.update")}
          {:else}
            {t("share.publish")}
          {/if}
        </Button>
      </div>
    </div>
  {/if}
</Dialog>
