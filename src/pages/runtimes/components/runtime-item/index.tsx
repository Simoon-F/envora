import { useInstalledVersions } from '@/hooks/use-runtimes';
import type { RuntimeType } from '@/types/runtime';

export interface RuntimeItemInfo {
  type: RuntimeType;
  name: string;
  icon: string;
}

interface RuntimeItemProps {
  runtime: RuntimeItemInfo;
  selected: boolean;
  onSelect: () => void;
}

export const RuntimeItem = ({ runtime, selected, onSelect }: RuntimeItemProps) => {
  const { data: installed } = useInstalledVersions(runtime.type);
  const count = installed?.length ?? 0;

  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
        selected ? 'border-primary/20 bg-primary/10' : 'border-transparent hover:bg-muted'
      }`}
    >
      <span className="text-xl">{runtime.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{runtime.name}</div>
        <div className="text-xs text-muted-foreground">已安装 {count} 个版本</div>
      </div>
      {count > 0 && (
        <span className={`h-2 w-2 rounded-full ${selected ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
      )}
    </button>
  );
};
