import type { ReactNode } from 'react';
import { useInstalledVersions } from '@/hooks/use-runtimes';
import { useTranslation } from '@/i18n/use-translation';
import type { RuntimeType } from '@/types/runtime';
import { cn } from '@/lib/utils';

export interface RuntimeItemInfo {
  type: RuntimeType;
  name: string;
  icon: ReactNode;
}

interface RuntimeItemProps {
  runtime: RuntimeItemInfo;
  selected: boolean;
  onSelect: () => void;
}

export const RuntimeItem = ({ runtime, selected, onSelect }: RuntimeItemProps) => {
  const { t } = useTranslation();
  const { data: installed } = useInstalledVersions(runtime.type);
  const count = installed?.length ?? 0;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-200',
        selected
          ? 'border-primary/30 bg-primary/5'
          : 'border-transparent hover:bg-muted/60',
      )}
    >
      {selected && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
      )}
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center',
          selected ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {runtime.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'text-sm transition-colors',
            selected ? 'font-medium text-foreground' : 'text-foreground',
          )}
        >
          {runtime.name}
        </div>
        <div className="text-xs text-muted-foreground">
          {t('Runtimes', 'InstalledVersionsCount', { count })}
        </div>
      </div>
      {count > 0 && (
        <span
          className={cn(
            'size-2 rounded-full transition-colors',
            selected ? 'bg-primary' : 'bg-muted-foreground/30',
          )}
        />
      )}
    </button>
  );
};
