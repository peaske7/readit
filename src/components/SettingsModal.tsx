import { X } from "lucide-react";
import { useEffect } from "react";
import { cn } from "../lib/utils";
import { FontFamilies, type FontFamily } from "../types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  fontFamily: FontFamily;
  onFontFamilyChange: (font: FontFamily) => Promise<void>;
}

export function SettingsModal({
  isOpen,
  onClose,
  fontFamily,
  onFontFamilyChange,
}: SettingsModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/20 backdrop-blur-sm cursor-default"
        onClick={onClose}
        aria-label="Close modal"
      />

      {/* Modal */}
      <div
        className="relative bg-white rounded-lg shadow-lg shadow-gray-200/50 border border-gray-100 w-full max-w-sm flex flex-col animate-in"
        role="dialog"
        aria-label="Settings"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-serif text-sm text-gray-900">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Font preference section */}
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
              Font
            </h3>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="fontFamily"
                  value={FontFamilies.SERIF}
                  checked={fontFamily === FontFamilies.SERIF}
                  onChange={() => onFontFamilyChange(FontFamilies.SERIF)}
                  className="w-4 h-4 text-gray-600 border-gray-300 focus:ring-gray-500"
                />
                <span className="text-sm text-gray-700">Serif</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="fontFamily"
                  value={FontFamilies.SANS_SERIF}
                  checked={fontFamily === FontFamilies.SANS_SERIF}
                  onChange={() => onFontFamilyChange(FontFamilies.SANS_SERIF)}
                  className="w-4 h-4 text-gray-600 border-gray-300 focus:ring-gray-500"
                />
                <span className="text-sm text-gray-700">Sans-serif</span>
              </label>
            </div>
          </div>

          {/* Preview section */}
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
              Preview
            </h3>
            <div
              className={cn(
                "p-3 rounded-md border border-gray-100 text-sm text-gray-600 leading-relaxed",
                fontFamily === FontFamilies.SERIF ? "font-serif" : "font-sans",
              )}
            >
              The quick brown fox jumps over the lazy dog. 1234567890
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
