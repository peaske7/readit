import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

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
          "w-full px-2 py-1.5 text-sm border border-zinc-200 resize-none focus:outline-none focus:border-zinc-400",
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
