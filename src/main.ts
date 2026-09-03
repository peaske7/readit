import { mount } from "svelte";
import "./index.css";
import App from "./App.svelte";
import { configureClient } from "./lib/client";
import { hydrateFromInlineData } from "./stores/app.svelte";
import { initSettings } from "./stores/settings.svelte";
import { initShortcuts } from "./stores/shortcuts.svelte";

const dataEl = document.getElementById("__readit");
if (dataEl) {
  const data = JSON.parse(dataEl.textContent ?? "{}");
  configureClient({
    hosted: data.hosted === true,
    basePath: data.apiBase,
    canShare: data.canShare === true,
  });
  hydrateFromInlineData(data);
  initSettings(data.settings);
  initShortcuts(data.settings?.keybindings ?? []);
}

mount(App, { target: document.getElementById("app")! });
