import { use, useEffect, useRef, useState } from "react";
import { useLocale } from "../../contexts/LocaleContext";
import { SettingsContext } from "../../contexts/SettingsContext";
import { cn } from "../../lib/utils";
import { FontFamilies } from "../../schema";
import { Button } from "../ui/Button";
import { Text } from "../ui/Text";

interface CommentInputProps {
  selectedText: string | null;
  onSubmit: (commentText: string) => void;
  onCancel: () => void;
}

export function CommentInput({
  selectedText,
  onSubmit,
  onCancel,
}: CommentInputProps) {
  const { t } = useLocale();
  const settings = use(SettingsContext);
  const fontClass = settings
    ? settings.fontFamily === FontFamilies.SANS_SERIF
      ? "font-sans"
      : "font-serif"
    : undefined;

  const [commentText, setCommentText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current && window.matchMedia("(pointer: fine)").matches) {
      textareaRef.current.focus();
    }
  }, []);

  const handleSubmit = () => {
    onSubmit(commentText.trim());
    setCommentText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.metaKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  };

  if (!selectedText) {
    return null;
  }

  return (
    <div
      data-comment-input
      className="border-t border-zinc-200 dark:border-zinc-700 pt-3 pb-2"
    >
      <Text variant="caption" as="div" className="italic mb-2 line-clamp-2">
        "{selectedText}"
      </Text>
      <textarea
        ref={textareaRef}
        value={commentText}
        onChange={(e) => setCommentText(e.target.value)}
        placeholder={t("comment.placeholder")}
        className={cn(
          fontClass,
          "w-full px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 resize-none focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500",
        )}
        rows={2}
        onKeyDown={handleKeyDown}
      />
      <div className="flex justify-end items-center gap-3 mt-2 text-sm">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t("comment.cancel")}
        </Button>
        <Button variant="link" size="sm" onClick={handleSubmit} title="⌘↵">
          {commentText.trim() ? t("comment.addNote") : t("comment.highlight")}
        </Button>
      </div>
    </div>
  );
}
