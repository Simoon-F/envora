import type { ReactNode } from 'react';
import { useInstalledVersions } from '@/hooks/use-runtimes';
import { useTranslation } from '@/i18n/use-translation';
import type { RuntimeType } from '@/types/runtime';

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
      className={`runtime-list-item ${selected ? 'runtime-list-item-active' : ''}`}
    >
      <span className={`shrink-0 transition-colors ${selected ? 'text-primary' : 'text-muted-foreground'}`}>
        {runtime.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-sm transition-colors ${selected ? 'font-medium text-foreground' : 'text-foreground'}`}>
          {runtime.name}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {t('Runtimes', 'InstalledVersionsCount', { count })}
        </div>
      </div>
      {count > 0 && (
        <span className={`size-1.5 rounded-full shrink-0 ${selected ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
      )}
    </button>
  );
};
