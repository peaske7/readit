import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function isMarkdownFile(filePath: string): boolean {
  return filePath.endsWith(".md") || filePath.endsWith(".markdown");
}

export function cn(...inputs: ReadonlyArray<ClassValue>) {
  return twMerge(clsx(inputs));
}

export function truncate(text: string, maxLength = 30): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}
