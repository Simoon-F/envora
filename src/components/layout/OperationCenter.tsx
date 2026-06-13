import { Activity, CheckCircle2, ListChecks, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { tauriInvoke } from '@/lib/tauri';
import { type OperationInfo, useOperationsStore } from '@/stores/operations';

function operationName(operation: OperationInfo) {
  if (operation.kind === 'runtime_install') {
    return `${operation.target.runtime || '运行时'} ${operation.target.version || ''}`.trim();
  }
  if (operation.target.tool) {
    return operation.target.tool;
  }
  return operation.kind;
}

function statusText(operation: OperationInfo) {
  switch (operation.status) {
    case 'queued':
      return '等待中';
    case 'running':
      return '进行中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
  }
}

function OperationIcon({ operation }: { operation: OperationInfo }) {
  if (operation.status === 'completed') return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (operation.status === 'failed') return <XCircle className="h-4 w-4 text-destructive" />;
  if (operation.status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  return <Activity className="h-4 w-4 text-muted-foreground" />;
}

function OperationRow({ operation }: { operation: OperationInfo }) {
  const remove = useOperationsStore((state) => state.remove);

  const clear = async () => {
    remove(operation.id);
    if (!operation.id.startsWith('legacy:')) {
      await tauriInvoke('clear_operation', { id: operation.id }).catch(() => undefined);
    }
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <OperationIcon operation={operation} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{operationName(operation)}</div>
            <div className="text-xs text-muted-foreground">{statusText(operation)}</div>
          </div>
        </div>
        {operation.status !== 'running' && operation.status !== 'queued' && (
          <Button variant="ghost" size="sm" className="h-7 shrink-0 text-xs" onClick={clear}>
            清除
          </Button>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-all ${operation.status === 'failed' ? 'bg-destructive' : 'bg-primary'}`}
          style={{ width: `${operation.percent}%` }}
        />
      </div>
      <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
        <span className="min-w-0 break-words">{operation.error || operation.message}</span>
        <span className="shrink-0 tabular-nums">{operation.percent.toFixed(0)}%</span>
      </div>
    </div>
  );
}

export function OperationCenter() {
  const operations = useOperationsStore((state) => Object.values(state.operations));
  const ordered = operations.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const running = ordered.filter((operation) => operation.status === 'running' || operation.status === 'queued');
  const latest = running[0] || ordered[0];

  return (
    <Sheet>
      <SheetTrigger
        render={
          <button className="w-full rounded-md border bg-background p-3 text-left transition-colors hover:bg-muted" />
        }
      >
        <div className="flex items-center gap-2">
          {running.length > 0 ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <ListChecks className="h-4 w-4 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium">任务</div>
            <div className="truncate text-xs text-muted-foreground">
              {latest ? `${operationName(latest)} · ${latest.percent.toFixed(0)}%` : '没有正在运行的任务'}
            </div>
          </div>
        </div>
      </SheetTrigger>
      <SheetContent className="w-[380px] sm:max-w-[380px]">
        <SheetHeader>
          <SheetTitle>任务</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-2 overflow-auto px-4 pb-4">
          {ordered.length > 0 ? (
            ordered.map((operation) => <OperationRow key={operation.id} operation={operation} />)
          ) : (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              暂无任务。
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
