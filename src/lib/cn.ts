import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges class names and resolves Tailwind conflicts, so a caller's
 * `px-6` reliably beats a component's default `px-4` instead of the
 * outcome depending on stylesheet order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
