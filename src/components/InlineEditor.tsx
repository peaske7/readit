import { use, useEffect, useRef, useState } from "react";
import { LayoutContext } from "../contexts/LayoutContext";
import { cn } from "../lib/utils";
import { FontFamilies } from "../types";
import { Button } from "./ui/Button";

interface InlineEditorProps {
  initialText: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  rows?: number;
  className?: string;
}

export function InlineEditor({
  initialText,
  onSave,
  onCancel,
  rows = 2,
  className,
}: InlineEditorProps) {
  const layout = use(LayoutContext);
  const fontClass = layout
    ? layout.fontFamily === FontFamilies.SANS_SERIF
      ? "font-sans"
      : "font-serif"
    : undefined;
  const [editText, setEditText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSave = () => {
    if (editText.trim()) {
      onSave(editText);
    }
  };

  return (
    <div className="space-y-2">
      <textarea
        ref={textareaRef}
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        className={cn(
          fontClass,
          "w-full px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 resize-none focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500",
          className,
        )}
        rows={rows}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.metaKey) {
            handleSave();
          }
          if (e.key === "Escape") {
            onCancel();
          }
        }}
      />
      <div className="flex gap-3 text-sm">
        <Button variant="link" size="sm" onClick={handleSave}>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
