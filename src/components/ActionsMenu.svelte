<script lang="ts">
import {
  ClipboardCopy,
  FileDown,
  FileText,
  Link,
  MoreHorizontal,
  RefreshCw,
  Settings,
  Share2,
} from "lucide-svelte";
import { client } from "../lib/client";
import { ShortcutActions } from "../lib/shortcut-registry";
import { app } from "../stores/app.svelte";
import { t } from "../stores/locale.svelte";
import { showToast } from "../stores/toast.svelte";
import RawModal from "./RawModal.svelte";
import SettingsModal from "./SettingsModal.svelte";
import ShareModal from "./ShareModal.svelte";
import Button from "./ui/Button.svelte";
import DropdownMenu from "./ui/DropdownMenu.svelte";
import DropdownMenuItem from "./ui/DropdownMenuItem.svelte";
import DropdownMenuSeparator from "./ui/DropdownMenuSeparator.svelte";
import Kbd from "./ui/Kbd.svelte";

interface Props {
  commentCount: number;
  oncopyall: () => void;
  onexportjson: () => void;
  onreload: () => void;
}

let { commentCount, oncopyall, onexportjson, onreload }: Props = $props();

let menuOpen = $state(false);
let rawModalOpen = $state(false);
let settingsOpen = $state(false);
let shareOpen = $state(false);

/** In hosted mode the page itself is the share; its URL is the API base. */
async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(`${location.origin}${client.basePath}`);
    showToast(t("toast.copiedLink"));
  } catch {}
}
</script>

<DropdownMenu bind:open={menuOpen} align="end" contentClass="min-w-[160px]">
  {#snippet trigger()}
    <Button
      variant="ghost"
      size="icon"
      class="size-7"
      title={t("actions.ariaLabel")}
    >
      <MoreHorizontal class="w-4 h-4" />
    </Button>
  {/snippet}

  <DropdownMenuItem
    onselect={() => {
      settingsOpen = true;
      menuOpen = false;
    }}
  >
    <Settings />
    {t("actions.settings")}
  </DropdownMenuItem>
  {#if client.capabilities.share}
    <DropdownMenuItem
      onselect={() => {
        shareOpen = true;
        menuOpen = false;
      }}
    >
      <Share2 />
      {t("actions.share")}
    </DropdownMenuItem>
  {:else if app.hosted}
    <DropdownMenuItem
      onselect={() => {
        copyShareLink();
        menuOpen = false;
      }}
    >
      <Link />
      {t("actions.copyLink")}
    </DropdownMenuItem>
  {/if}
  <DropdownMenuSeparator />
  <DropdownMenuItem
    onselect={() => {
      onreload();
      menuOpen = false;
    }}
  >
    <RefreshCw />
    {t("actions.reload")}
  </DropdownMenuItem>
  {#if commentCount > 0}
    <DropdownMenuItem
      onselect={() => {
        oncopyall();
        menuOpen = false;
      }}
    >
      <ClipboardCopy />
      {t("actions.copyAll")}
      <Kbd action={ShortcutActions.COPY_ALL} class="ml-auto" />
    </DropdownMenuItem>
    <DropdownMenuItem
      onselect={() => {
        onexportjson();
        menuOpen = false;
      }}
    >
      <FileDown />
      {t("actions.exportJson")}
    </DropdownMenuItem>
    <DropdownMenuItem
      onselect={() => {
        rawModalOpen = true;
        menuOpen = false;
      }}
    >
      <FileText />
      {t("actions.viewRaw")}
    </DropdownMenuItem>
  {/if}
</DropdownMenu>

<RawModal bind:open={rawModalOpen} onclose={() => (rawModalOpen = false)} />
<SettingsModal bind:open={settingsOpen} onclose={() => (settingsOpen = false)} />
<ShareModal bind:open={shareOpen} onclose={() => (shareOpen = false)} />
