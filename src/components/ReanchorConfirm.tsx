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
  return (
    <div className="border-t border-zinc-200 pt-2 pb-3 pl-6">
      <Text variant="body" className="mb-2">
        Re-anchor to this selection?
      </Text>
      <Text variant="caption" asChild>
        <p className="italic line-clamp-2 mb-2">"{selectionText}"</p>
      </Text>
      <div className="flex gap-3 text-sm">
        <Button variant="link" size="sm" onClick={onConfirm}>
          Confirm
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
