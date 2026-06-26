import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface RuntimeHeaderProps {
  icon: ReactNode;
  name: string;
  version?: string;
  versionLabel?: string;
  actions?: ReactNode;
  className?: string;
}

export const RuntimeHeader = ({
  icon,
  name,
  version,
  versionLabel,
  actions,
  className,
}: RuntimeHeaderProps) => {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground',
            'shrink-0',
          )}
        >
          {icon}
        </span>
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
          {version && (
            <Badge variant="outline" className="font-mono">
              {versionLabel ? `${versionLabel} ` : ''}v{version}
            </Badge>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
};
