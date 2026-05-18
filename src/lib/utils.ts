import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Returns true when the image URL was stored in an upscaled subfolder. */
export function isUpscaled(url: string): boolean {
  return /\/upscaled(?:-ai)?\//.test(url);
}
