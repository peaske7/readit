import { mount } from "svelte";
import "./index.css";
import App from "./App.svelte";
import { hydrateFromInlineData } from "./stores/app.svelte";
import { initSettings } from "./stores/settings.svelte";
import { initShortcuts } from "./stores/shortcuts.svelte";

const dataEl = document.getElementById("__readit");
if (dataEl) {
  const data = JSON.parse(dataEl.textContent ?? "{}");
  hydrateFromInlineData(data);
  initSettings(data.settings);
  initShortcuts(data.settings?.keybindings ?? []);
}

mount(App, { target: document.getElementById("app")! });
