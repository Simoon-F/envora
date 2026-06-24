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
      className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
        selected ? 'border-primary/20 bg-primary/10' : 'border-transparent hover:bg-muted'
      }`}
    >
      <span className="flex h-6 w-6 items-center justify-center text-xl">{runtime.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{runtime.name}</div>
        <div className="text-xs text-muted-foreground">{t('Runtimes', 'InstalledVersionsCount', { count })}</div>
      </div>
      {count > 0 && (
        <span className={`h-2 w-2 rounded-full ${selected ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
      )}
    </button>
  );
};
