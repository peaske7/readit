import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCommentContext } from "../../contexts/CommentContext";
import { useLocale } from "../../contexts/LocaleContext";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import { Text } from "../ui/Text";

const ANIMATION_DURATION_MS = 200;

export function CommentNav() {
  const { t } = useLocale();
  const { currentIndex, sortedComments, navigatePrevious, navigateNext } =
    useCommentContext();
  const totalComments = sortedComments.length;

  const [isHovered, setIsHovered] = useState(false);
  const [animating, setAnimating] = useState<"prev" | "next" | null>(null);
  const animationTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    return () => clearTimeout(animationTimeoutRef.current);
  }, []);

  if (totalComments <= 1) return null;

  const handlePrevious = () => {
    setAnimating("prev");
    navigatePrevious();
    clearTimeout(animationTimeoutRef.current);
    animationTimeoutRef.current = setTimeout(
      () => setAnimating(null),
      ANIMATION_DURATION_MS,
    );
  };

  const handleNext = () => {
    setAnimating("next");
    navigateNext();
    clearTimeout(animationTimeoutRef.current);
    animationTimeoutRef.current = setTimeout(
      () => setAnimating(null),
      ANIMATION_DURATION_MS,
    );
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
          "bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md shadow-lg border border-zinc-200/60 dark:border-zinc-700/60",
          "transition-opacity duration-150 ease-out",
          isHovered ? "opacity-100" : "opacity-0",
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "size-7 rounded-full text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300",
            animating === "prev" &&
              "scale-90 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300",
          )}
          onClick={handlePrevious}
          title={t("commentNav.previous")}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        <Text variant="body" asChild>
          <span
            className={cn(
              "px-3 tabular-nums select-none min-w-[4rem] text-center",
              "transition-transform duration-200 ease-out",
              animating === "prev" && "-translate-x-0.5",
              animating === "next" && "translate-x-0.5",
            )}
          >
            {t("commentNav.of", {
              current: currentIndex + 1,
              total: totalComments,
            })}
          </span>
        </Text>

        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "size-7 rounded-full text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300",
            animating === "next" &&
              "scale-90 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300",
          )}
          onClick={handleNext}
          title={t("commentNav.next")}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </fieldset>
  );
}
