import { useLocale } from "../contexts/LocaleContext";
import { Button } from "./ui/Button";
import { Text } from "./ui/Text";

interface ReanchorConfirmProps {
  selectionText: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ReanchorConfirm({
  selectionText,
  onConfirm,
  onCancel,
}: ReanchorConfirmProps) {
  const { t } = useLocale();

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-700 pt-2 pb-3 pl-6">
      <Text variant="body" className="mb-2">
        {t("reanchor.question")}
      </Text>
      <Text variant="caption" className="italic line-clamp-2 mb-2">
        "{selectionText}"
      </Text>
      <div className="flex gap-3 text-sm">
        <Button variant="link" size="sm" onClick={onConfirm}>
          {t("reanchor.confirm")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t("reanchor.cancel")}
        </Button>
      </div>
    </div>
  );
}
