import { useCallback, useEffect } from "react";
import {
  eventToBinding,
  isReservedBinding,
  type ShortcutBinding,
} from "../lib/shortcut-registry";

interface ShortcutCaptureProps {
  onCapture: (binding: ShortcutBinding) => void;
  onCancel: () => void;
}

export function ShortcutCapture({ onCapture, onCancel }: ShortcutCaptureProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        onCancel();
        return;
      }

      const binding = eventToBinding(e);
      if (!binding) return;

      if (isReservedBinding(binding)) return;

      onCapture(binding);
    },
    [onCapture, onCancel],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [handleKeyDown]);

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium animate-pulse">
      Press keys...
    </span>
  );
}
