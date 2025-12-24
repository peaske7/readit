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
  const [animating, setAnimating] = useState<"prev" | "next" | null>(null);

  if (totalComments <= 1) return null;

  const handlePrevious = () => {
    setAnimating("prev");
    onPrevious();
    setTimeout(() => setAnimating(null), 200);
  };

  const handleNext = () => {
    setAnimating("next");
    onNext();
    setTimeout(() => setAnimating(null), 200);
  };

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
          "transition-all duration-300 ease-out",
          isHovered ? "opacity-100" : "opacity-0",
        )}
      >
        <button
          type="button"
          onClick={handlePrevious}
          className={cn(
            "w-7 h-7 flex items-center justify-center rounded-full transition-all duration-150",
            "text-gray-400 hover:text-gray-600 hover:bg-gray-100",
            animating === "prev" && "scale-90 bg-gray-100 text-gray-600",
          )}
          title="Previous comment (Alt+↑)"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span
          className={cn(
            "px-3 text-sm tabular-nums text-gray-500 select-none min-w-[4rem] text-center",
            "transition-transform duration-200 ease-out",
            animating === "prev" && "-translate-x-0.5",
            animating === "next" && "translate-x-0.5",
          )}
        >
          {currentIndex + 1} of {totalComments}
        </span>

        <button
          type="button"
          onClick={handleNext}
          className={cn(
            "w-7 h-7 flex items-center justify-center rounded-full transition-all duration-150",
            "text-gray-400 hover:text-gray-600 hover:bg-gray-100",
            animating === "next" && "scale-90 bg-gray-100 text-gray-600",
          )}
          title="Next comment (Alt+↓)"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </fieldset>
  );
}
