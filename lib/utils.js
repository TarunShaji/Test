import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function normalizeUrl(url) {
  if (!url) return '';
  if (url.match(/^[a-zA-Z]+:\/\//)) return url;
  return `https://${url}`;
}
