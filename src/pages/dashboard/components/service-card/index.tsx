import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useAllServices,
  useClearServiceLog,
  useRestartService,
  useServiceLog,
  useStartService,
  useStopService,
} from '@/hooks/use-services';
import { useDefaultVersion } from '@/hooks/use-runtimes';
import type { ServiceStatus } from '@/types/service';
import { FileText, Play, RotateCw, Square, Trash2 } from 'lucide-react';

const runtimeName: Record<string, string> = {
  nginx: 'nginx',
  mysql: 'mysql',
  'php-fpm': 'php',
};

const statusColors: Record<ServiceStatus, string> = {
  running: 'bg-green-500',
  stopped: 'bg-red-500',
  error: 'bg-red-500',
  starting: 'bg-yellow-500',
  stopping: 'bg-yellow-500',
  unknown: 'bg-gray-500',
};

const statusLabels: Record<ServiceStatus, string> = {
  running: '运行中',
  stopped: '已停止',
  error: '错误',
  starting: '启动中...',
  stopping: '停止中...',
  unknown: '未知',
};

interface ServiceCardProps {
  serviceType: string;
  title: string;
}

export const ServiceCard = ({ serviceType, title }: ServiceCardProps) => {
  const [logOpen, setLogOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const { data: services, mutate } = useAllServices();
  const { data: defaultVersion } = useDefaultVersion(runtimeName[serviceType]);
  const { data: serviceLog, isLoading: isLogLoading, mutate: refreshLog } = useServiceLog(
    logOpen ? serviceType : null,
    logOpen && defaultVersion ? defaultVersion : null,
  );
  const { mutate: clearLog, isLoading: isClearingLog } = useClearServiceLog();
  const { mutate: startService, isLoading: isStarting } = useStartService();
  const { mutate: stopService, isLoading: isStopping } = useStopService();
  const { mutate: restartService, isLoading: isRestarting } = useRestartService();

  const service = services?.find((item) => item.id.startsWith(serviceType));
  const status = service?.status ?? 'stopped';

  const handleStart = async () => {
    if (!defaultVersion) return;
    setActionError('');
    try {
      await startService({ serviceType, version: defaultVersion });
      mutate();
    } catch (e) {
      setActionError(String(e));
      setLogOpen(true);
    }
  };

  const handleStop = async () => {
    if (!service) return;
    setActionError('');
    try {
      await stopService({ serviceId: service.id });
      mutate();
    } catch (e) {
      setActionError(String(e));
    }
  };

  const handleRestart = async () => {
    if (!service) return;
    setActionError('');
    try {
      await restartService({ serviceId: service.id });
      mutate();
    } catch (e) {
      setActionError(String(e));
      setLogOpen(true);
    }
  };

  const handleClearLog = async () => {
    if (!defaultVersion) return;
    await clearLog({ serviceType, version: defaultVersion });
    refreshLog();
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Badge variant={status === 'running' ? 'default' : 'secondary'}>
            <span className={`mr-2 h-2 w-2 rounded-full ${statusColors[status]}`} />
            {statusLabels[status]}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {defaultVersion && <span className="mr-3">v{defaultVersion}</span>}
              {service?.pid ? `PID: ${service.pid}` : '未运行'}
              {service?.port ? ` • 端口: ${service.port}` : ''}
            </div>
            {actionError && <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-600">{actionError}</p>}
            <div className="flex flex-wrap gap-2">
              {status === 'running' ? (
                <>
                  <Button variant="outline" size="sm" onClick={handleStop} disabled={isStopping}>
                    <Square className="mr-1 h-3 w-3" />
                    停止
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleRestart} disabled={isRestarting}>
                    <RotateCw className="mr-1 h-3 w-3" />
                    重启
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={handleStart} disabled={isStarting || !defaultVersion}>
                  <Play className="mr-1 h-3 w-3" />
                  启动
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setLogOpen(true);
                  refreshLog();
                }}
                disabled={!defaultVersion}
              >
                <FileText className="mr-1 h-3 w-3" />
                日志
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader className="pr-10">
            <DialogTitle>{title} 日志</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleClearLog} disabled={isClearingLog || !defaultVersion}>
              <Trash2 className="mr-1 h-3 w-3" />
              清空
            </Button>
          </div>
          <div className="max-h-[60vh] space-y-3 overflow-auto pr-1">
            {isLogLoading ? (
              <div className="rounded-md border bg-muted p-3 text-xs text-muted-foreground">加载中...</div>
            ) : serviceLog?.length ? (
              serviceLog.map((section) => (
                <section key={section.path} className="overflow-hidden rounded-md border">
                  <div className="flex items-center justify-between gap-3 border-b bg-muted/60 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{section.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{section.path}</div>
                    </div>
                    <Badge variant={section.exists ? 'outline' : 'secondary'} className="shrink-0 text-[11px]">
                      {section.exists ? '存在' : '缺失'}
                    </Badge>
                  </div>
                  <pre className="max-h-56 overflow-auto bg-background p-3 text-xs whitespace-pre-wrap">
                    {section.content || '暂无日志'}
                  </pre>
                </section>
              ))
            ) : (
              <div className="rounded-md border bg-muted p-3 text-xs text-muted-foreground">暂无日志</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
