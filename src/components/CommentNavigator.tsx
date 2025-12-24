import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";

interface CommentNavigatorProps {
  currentIndex: number;
  totalComments: number;
  onPrevious: () => void;
  onNext: () => void;
}

export function CommentNavigator({
  currentIndex,
  totalComments,
  onPrevious,
  onNext,
}: CommentNavigatorProps) {
  const [isHovered, setIsHovered] = useState(false);

  if (totalComments <= 1) return null;

  return (
    <fieldset
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          "inline-flex items-center gap-1 h-9 px-3 rounded-full",
          "bg-white/90 backdrop-blur-md shadow-lg border border-gray-200/60",
          "transition-opacity duration-200",
          isHovered ? "opacity-100" : "opacity-40",
        )}
      >
        <button
          type="button"
          onClick={onPrevious}
          className="w-7 h-7 flex items-center justify-center rounded-full transition-colors text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          title="Previous comment (Alt+↑)"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="px-3 text-sm tabular-nums text-gray-500 select-none min-w-[4rem] text-center">
          {currentIndex + 1} of {totalComments}
        </span>

        <button
          type="button"
          onClick={onNext}
          className="w-7 h-7 flex items-center justify-center rounded-full transition-colors text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          title="Next comment (Alt+↓)"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </fieldset>
  );
}
