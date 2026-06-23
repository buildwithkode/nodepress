import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Turn a snake_cased content-type or field name into a friendly title.
 * e.g. "article_page" → "Article Page".
 */
export function humanizeName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * The label to show for a content type: the human display name the user typed
 * if present, otherwise a Title-Cased version of the snake_case key.
 */
export function ctLabel(ct: { displayName?: string | null; name: string }): string {
  return ct.displayName?.trim() || humanizeName(ct.name)
}
