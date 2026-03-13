import { useLayoutContext } from "../contexts/LayoutContext";
import { cn } from "../lib/utils";
import { FontFamilies } from "../types";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/Dialog";
import { Text, textVariants } from "./ui/Text";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { fontFamily, setFontFamily } = useLayoutContext();

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div>
            <Text variant="overline" asChild>
              <h3 className="mb-3">Font</h3>
            </Text>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="fontFamily"
                  value={FontFamilies.SERIF}
                  checked={fontFamily === FontFamilies.SERIF}
                  onChange={() => setFontFamily(FontFamilies.SERIF)}
                  className="w-4 h-4 text-zinc-600 border-zinc-300 focus:ring-zinc-500"
                />
                <Text variant="body" asChild>
                  <span>Serif</span>
                </Text>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="fontFamily"
                  value={FontFamilies.SANS_SERIF}
                  checked={fontFamily === FontFamilies.SANS_SERIF}
                  onChange={() => setFontFamily(FontFamilies.SANS_SERIF)}
                  className="w-4 h-4 text-zinc-600 border-zinc-300 focus:ring-zinc-500"
                />
                <Text variant="body" asChild>
                  <span>Sans-serif</span>
                </Text>
              </label>
            </div>
          </div>

          <div>
            <Text variant="overline" asChild>
              <h3 className="mb-3">Preview</h3>
            </Text>
            <div
              className={cn(
                textVariants({ variant: "body" }),
                "p-3 rounded-md border border-zinc-100 leading-relaxed",
                fontFamily === FontFamilies.SERIF ? "font-serif" : "font-sans",
              )}
            >
              The quick brown fox jumps over the lazy dog. 1234567890
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
