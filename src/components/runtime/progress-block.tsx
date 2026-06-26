import { useTranslation } from '@/i18n/use-translation';
import { cn } from '@/lib/utils';

interface ProgressBlockProps {
  /** Optional prefix shown before the message, e.g. "PHP 8.3.0". */
  label?: string;
  message?: string | null;
  error?: string | null;
  percent: number;
  status: string;
  onClear?: () => void;
  className?: string;
}

export const ProgressBlock = ({
  label,
  message,
  error,
  percent,
  status,
  onClear,
  className,
}: ProgressBlockProps) => {
  const { t } = useTranslation();
  const failed = status === 'failed';
  const canClear = status !== 'running' && status !== 'queued';

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            failed ? 'bg-danger' : 'bg-primary',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="min-w-0 wrap-break-word">
          {label && <span className="text-foreground">{label}：</span>}
          {error || message}
        </span>
        <span className="flex shrink-0 items-center gap-2 tabular-nums">
          {percent.toFixed(0)}%
          {canClear && onClear && (
            <button
              type="button"
              className="text-foreground/70 hover:text-primary hover:underline"
              onClick={onClear}
            >
              {t('Common', 'Clear')}
            </button>
          )}
        </span>
      </div>
    </div>
  );
};
