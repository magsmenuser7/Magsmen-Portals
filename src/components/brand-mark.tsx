import { cn } from "@/lib/utils";

/** Magsmen monogram, inherits the current text color. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 128" aria-hidden="true" className={cn("h-4 w-4", className)} fill="currentColor">
      <path d="M119,112.56h-18.58l-10.86-29.55h-.03l-.03-.12-5.55-15.11c-3.14-8.51-4.7-17.43-4.7-26.36s1.5-17.58,4.52-25.97h.23l24.3,67.44,10.68,29.67Z" />
      <path d="M20.8,81.04c1,12.91-3.23,30.23-3.35,31.52h-8.45c.64-1.59,11.8-31.52,11.8-31.52Z" />
      <path d="M71.25,90.11l8.07,22.45h-18.58l-10.92-29.67h.03l-5.58-15.11c-3.14-8.51-4.73-17.46-4.73-26.41s1.53-17.55,4.55-25.92h.23l12.62,34.9,11.71,32.55,2.58,7.22Z" />
    </svg>
  );
}

export const BRAND_NAME = "Magsmen Portal";
