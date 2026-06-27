import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageContainerProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Constrain content width (e.g. settings forms). */
  maxWidth?: 'default' | 'narrow';
}

export const PageContainer = ({
  title,
  description,
  actions,
  children,
  className,
  maxWidth = 'default',
}: PageContainerProps) => {
  return (
    <div
      className={cn(
        'space-y-5 p-5',
        maxWidth === 'narrow' && 'mx-auto max-w-2xl',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
};
