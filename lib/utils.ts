import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// shadcn/ui 호환 cn 헬퍼
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
