import { Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InstallableVersionRowProps {
  label: string;
  isInstalling: boolean;
  isThisInstalling: boolean;
  onInstall: () => void;
}

export const InstallableVersionRow = ({
  label,
  isInstalling,
  isThisInstalling,
  onInstall,
}: InstallableVersionRowProps) => {
  return (
    <button
      type="button"
      className={cn(
        'group flex w-full items-center justify-between rounded-lg bg-card px-3 py-2 text-left transition-colors hover:bg-muted/60',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-card',
      )}
      disabled={isInstalling}
      onClick={onInstall}
    >
      <span className="font-mono text-sm">{label}</span>
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors group-hover:text-primary">
        {isThisInstalling ? (
          <Loader2 className="size-3.5 animate-spin text-primary" />
        ) : (
          <Download className="size-3.5" />
        )}
      </span>
    </button>
  );
};
