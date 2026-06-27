import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
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
import { useTranslation } from '@/i18n/use-translation';
import type { ServiceStatus } from '@/types/service';
import { FileText, Play, RotateCw, Square, Trash2 } from 'lucide-react';

const runtimeName: Record<string, string> = {
  nginx: 'nginx',
  mysql: 'mysql',
  'php-fpm': 'php',
};

const statusColors: Record<ServiceStatus, string> = {
  running: 'bg-success',
  stopped: 'bg-muted-foreground/40',
  error: 'bg-danger',
  starting: 'bg-warning',
  stopping: 'bg-warning',
  unknown: 'bg-muted-foreground/40',
};

const statusBadgeVariant: Record<ServiceStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  running: 'success',
  stopped: 'secondary',
  error: 'destructive',
  starting: 'warning',
  stopping: 'warning',
  unknown: 'secondary',
};

const statusLabelKeys = {
  running: 'Running',
  stopped: 'Stopped',
  error: 'Error',
  starting: 'Starting',
  stopping: 'Stopping',
  unknown: 'Unknown',
} as const satisfies Record<ServiceStatus, string>;

interface ServiceCardProps {
  serviceType: string;
  title: string;
}

export const ServiceCard = ({ serviceType, title }: ServiceCardProps) => {
  const { t } = useTranslation();
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
      <Card size="sm" className="card-subtle">
        <CardContent className="space-y-3 p-4">
          {/* Header: title + status dot */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{title}</h3>
            <Badge variant={statusBadgeVariant[status]} className="gap-1.5 px-2 py-0">
              <span className={`status-dot ${statusColors[status]}`} />
              {t('Dashboard', statusLabelKeys[status])}
            </Badge>
          </div>

          {/* Info row */}
          <div className="text-xs text-muted-foreground">
            {defaultVersion && <span className="mr-3 font-mono tabular-nums">v{defaultVersion}</span>}
            {service?.pid ? `PID: ${service.pid}` : t('Dashboard', 'NotRunning')}
            {service?.port ? ` · ${t('Dashboard', 'Port')}: ${service.port}` : ''}
          </div>

          {/* Action row */}
          {actionError && <p className="rounded-lg bg-danger/10 p-2 text-xs text-danger">{actionError}</p>}
          <div className="flex flex-wrap gap-1.5">
            {status === 'running' ? (
              <>
                <Button variant="outline" size="xs" onClick={handleStop} disabled={isStopping}>
                  <Square className="mr-1 size-3" />
                  {t('Dashboard', 'Stop')}
                </Button>
                <Button variant="outline" size="xs" onClick={handleRestart} disabled={isRestarting}>
                  <RotateCw className="mr-1 size-3" />
                  {t('Dashboard', 'Restart')}
                </Button>
              </>
            ) : (
              <Button size="xs" onClick={handleStart} disabled={isStarting || !defaultVersion}>
                <Play className="mr-1 size-3" />
                {t('Dashboard', 'Start')}
              </Button>
            )}
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                setLogOpen(true);
                refreshLog();
              }}
              disabled={!defaultVersion}
            >
              <FileText className="mr-1 size-3" />
              {t('Common', 'Logs')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader className="pr-10">
            <DialogTitle>{t('Dashboard', 'ServiceLogs', { service: title })}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end">
            <Button variant="outline" size="xs" onClick={handleClearLog} disabled={isClearingLog || !defaultVersion}>
              <Trash2 className="mr-1 size-3" />
              {t('Dashboard', 'ClearLogs')}
            </Button>
          </div>
          <div className="max-h-[60vh] space-y-3 overflow-auto pr-1">
            {isLogLoading ? (
              <div className="rounded-lg bg-code-bg p-3 text-xs text-muted-foreground">{t('Common', 'Loading')}</div>
            ) : serviceLog?.length ? (
              serviceLog.map((section) => (
                <section key={section.path} className="overflow-hidden rounded-lg border border-border">
                  <div className="flex items-center justify-between gap-3 bg-muted/60 px-3 py-1.5">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{section.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{section.path}</div>
                    </div>
                    <Badge variant={section.exists ? 'outline' : 'secondary'} className="shrink-0 text-[11px]">
                      {section.exists ? t('Dashboard', 'Exists') : t('Dashboard', 'Missing')}
                    </Badge>
                  </div>
                  <pre className="max-h-56 overflow-auto bg-code-bg p-3 text-xs whitespace-pre-wrap">
                    {section.content || t('Dashboard', 'NoLogs')}
                  </pre>
                </section>
              ))
            ) : (
              <div className="rounded-lg bg-code-bg p-3 text-xs text-muted-foreground">{t('Dashboard', 'NoLogs')}</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
