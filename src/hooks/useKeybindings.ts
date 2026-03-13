import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  resolveShortcuts,
  type ShortcutDefinition,
} from "../lib/shortcut-registry";
import type { KeybindingOverride, ShortcutBinding } from "../types";

interface UseKeybindingsResult {
  shortcuts: ShortcutDefinition[];
  updateBinding: (id: string, binding: ShortcutBinding) => Promise<void>;
  toggleEnabled: (id: string) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  isLoading: boolean;
}

export function useKeybindings(filePath: string | null): UseKeybindingsResult {
  const [overrides, setOverrides] = useState<KeybindingOverride[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;

  // Fetch keybindings from settings on mount
  useEffect(() => {
    if (!filePath) {
      setIsLoading(false);
      return;
    }

    const fetchKeybindings = async () => {
      try {
        const query = `?path=${encodeURIComponent(filePath)}`;
        const response = await fetch(`/api/settings${query}`);
        if (response.ok) {
          const settings = await response.json();
          setOverrides(settings.keybindings ?? []);
        }
      } catch (err) {
        console.error("Failed to fetch keybindings:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchKeybindings();
  }, [filePath]);

  const persistOverrides = useCallback(
    async (newOverrides: KeybindingOverride[]) => {
      try {
        const fp = filePathRef.current;
        const query = fp ? `?path=${encodeURIComponent(fp)}` : "";
        const response = await fetch(`/api/settings${query}`);
        if (!response.ok) return;

        const currentSettings = await response.json();
        const updated = { ...currentSettings, keybindings: newOverrides };

        const putResponse = await fetch(`/api/settings${query}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });

        if (!putResponse.ok) {
          throw new Error("Failed to save keybindings");
        }
      } catch (err) {
        console.error("Failed to save keybindings:", err);
        toast.error("Failed to save keybindings");
      }
    },
    [],
  );

  const updateBinding = useCallback(
    async (id: string, binding: ShortcutBinding) => {
      const newOverrides = overrides.filter((o) => o.id !== id);
      newOverrides.push({ id, binding, enabled: true });

      setOverrides(newOverrides);
      await persistOverrides(newOverrides);
    },
    [overrides, persistOverrides],
  );

  const toggleEnabled = useCallback(
    async (id: string) => {
      const existing = overrides.find((o) => o.id === id);
      const currentEnabled = existing?.enabled ?? true;
      const newOverrides = overrides.filter((o) => o.id !== id);
      newOverrides.push({
        id,
        binding: existing?.binding,
        enabled: !currentEnabled,
      });

      setOverrides(newOverrides);
      await persistOverrides(newOverrides);
    },
    [overrides, persistOverrides],
  );

  const resetToDefaults = useCallback(async () => {
    setOverrides([]);
    await persistOverrides([]);
    toast.success("Keyboard shortcuts reset to defaults");
  }, [persistOverrides]);

  const shortcuts = resolveShortcuts(overrides);

  return {
    shortcuts,
    updateBinding,
    toggleEnabled,
    resetToDefaults,
    isLoading,
  };
}
