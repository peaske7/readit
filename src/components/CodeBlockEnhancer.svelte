<script lang="ts">
import { Copy } from "lucide-svelte";
import { mount, unmount } from "svelte";
import { getCodeBlockText } from "../lib/code-block";
import { UI_CHROME_ATTR } from "../lib/highlight/dom";
import { localeState, t } from "../stores/locale.svelte";
import { showToast } from "../stores/toast.svelte";

interface Props {
  root: HTMLElement | undefined;
  contentVersion: number;
}

let { root, contentVersion }: Props = $props();

const ENHANCED_FLAG = "readitCodeEnhanced";

function isEnhanceablePre(pre: HTMLPreElement): boolean {
  if (pre.classList.contains("mermaid-source-view")) return false;
  if (pre.closest(".mermaid-container")) return false;
  if (pre.closest(".code-block-container")) return false;
  return true;
}

async function copyCode(pre: HTMLPreElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(getCodeBlockText(pre));
    showToast(t("codeBlock.copied"));
  } catch {
    showToast(t("codeBlock.copyFailed"));
  }
}

interface ToolbarHandle {
  cleanup: () => void;
}

function buildToolbar(pre: HTMLPreElement): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "code-block-toolbar";
  toolbar.setAttribute("contenteditable", "false");
  toolbar.setAttribute(UI_CHROME_ATTR, "");

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.dataset.action = "copy";
  copyBtn.setAttribute("aria-label", t("codeBlock.copy"));

  toolbar.appendChild(copyBtn);

  const copyIcon = mount(Copy, {
    target: copyBtn,
    props: { size: 14 },
  });

  copyBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void copyCode(pre);
  });

  const handle: ToolbarHandle = {
    cleanup: () => {
      void unmount(copyIcon);
    },
  };
  (toolbar as HTMLElement & { _readitHandle?: ToolbarHandle })._readitHandle =
    handle;

  return toolbar;
}

function enhance(target: HTMLElement) {
  const pres = target.querySelectorAll<HTMLPreElement>("pre");

  for (const pre of pres) {
    if (!isEnhanceablePre(pre)) continue;

    const wrapper = document.createElement("div");
    wrapper.className = "code-block-container";
    wrapper.dataset[ENHANCED_FLAG] = "true";

    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);
    wrapper.appendChild(buildToolbar(pre));
  }
}

function cleanup(target: HTMLElement) {
  const toolbars = target.querySelectorAll<HTMLElement>(".code-block-toolbar");
  for (const toolbar of toolbars) {
    (
      toolbar as HTMLElement & { _readitHandle?: ToolbarHandle }
    )._readitHandle?.cleanup();
  }
}

$effect(() => {
  if (!root) return;
  void contentVersion;
  enhance(root);
  return () => {
    if (root) cleanup(root);
  };
});

$effect(() => {
  if (!root) return;
  void localeState.locale;
  const copyButtons = root.querySelectorAll<HTMLButtonElement>(
    '.code-block-toolbar [data-action="copy"]',
  );
  for (const button of copyButtons) {
    button.setAttribute("aria-label", t("codeBlock.copy"));
  }
});
</script>
