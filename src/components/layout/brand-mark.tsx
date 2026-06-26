import { cn } from '@/lib/utils';

interface BrandMarkProps {
  className?: string;
}

/**
 * Envora brand mark — the app icon (rounded tile + bolt).
 * Renders the same asset used for the desktop / taskbar icon.
 */
export const BrandMark = ({ className }: BrandMarkProps) => {
  return (
    <img
      src="/logo.png"
      alt="Envora"
      width={20}
      height={20}
      className={cn('h-5 w-5 rounded-md', className)}
      draggable={false}
    />
  );
};
