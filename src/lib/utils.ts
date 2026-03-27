import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function isMarkdownFile(filePath: string): boolean {
  return filePath.endsWith(".md") || filePath.endsWith(".markdown");
}

export function isHtmlFile(filePath: string): boolean {
  return filePath.endsWith(".html") || filePath.endsWith(".htm");
}

export function isSupportedFile(filePath: string): boolean {
  return isMarkdownFile(filePath) || isHtmlFile(filePath);
}

export function cn(...inputs: ReadonlyArray<ClassValue>) {
  return twMerge(clsx(inputs));
}

export function truncate(text: string, maxLength = 30): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}
