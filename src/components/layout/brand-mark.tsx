import { cn } from '@/lib/utils';

interface BrandMarkProps {
  className?: string;
}

/**
 * Envora brand mark — a bolt/hex hybrid in the warm amber accent.
 * Inherits currentColor so it adapts to context.
 */
export const BrandMark = ({ className }: BrandMarkProps) => {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-5 w-5', className)}
      aria-hidden="true"
    >
      <path
        d="M18 4 8 19h7l-2 9 12-16h-7l1-8Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
    </svg>
  );
};
