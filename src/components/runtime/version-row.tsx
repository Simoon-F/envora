import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, Trash2 } from 'lucide-react';
import { useTranslation } from '@/i18n/use-translation';
import { cn } from '@/lib/utils';

interface VersionRowProps {
  /** Display label, e.g. "PHP 8.3.0" or "JDK 21". */
  label: string;
  /** Size in bytes (number) or a pre-formatted string. */
  size?: number | string;
  isDefault: boolean;
  onSetDefault?: () => void;
  onUninstall?: () => void;
  className?: string;
}

const formatSize = (size?: number | string): string => {
  if (size == null || size === '') return '';
  if (typeof size === 'string') return size;
  if (size === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(size) / Math.log(k));
  return `${parseFloat((size / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const VersionRow = ({
  label,
  size,
  isDefault,
  onSetDefault,
  onUninstall,
  className,
}: VersionRowProps) => {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'group flex items-center justify-between gap-3 rounded-lg bg-card p-2.5 transition-colors hover:bg-muted/60',
        isDefault && 'bg-primary/5',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-mono text-sm">{label}</span>
        {isDefault && (
          <Badge variant="success" className="shrink-0 gap-1 px-1.5 py-0 text-[11px]">
            <Check className="size-2.5" />
            {t('Common', 'Default')}
          </Badge>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {size != null && size !== '' && (
          <span className="text-xs tabular-nums text-muted-foreground">{formatSize(size)}</span>
        )}
        {onSetDefault && !isDefault && (
          <Button variant="ghost" size="xs" onClick={onSetDefault}>
            {t('Common', 'SetDefault')}
          </Button>
        )}
        {onUninstall && (
          <Button
            variant="ghost"
            size="icon-xs"
            title={t('Common', 'Installed')}
            onClick={onUninstall}
          >
            <Trash2 className="size-3 text-muted-foreground/60 group-hover:text-danger" />
          </Button>
        )}
      </div>
    </div>
  );
};
