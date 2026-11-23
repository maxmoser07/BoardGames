import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Kombiniert Tailwind-Klassen und loest Konflikte zugunsten der letzten Klasse. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
