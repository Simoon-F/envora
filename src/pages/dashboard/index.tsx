import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAllServices, useStartAllServices, useStopAllServices } from '@/hooks/use-services';
import { listen } from '@tauri-apps/api/event';
import { Power, PowerOff } from 'lucide-react';
import { ServiceCard } from './components/service-card';
import { useTranslation } from '@/i18n/use-translation';

export const Dashboard = () => {
  const [startAllError, setStartAllError] = useState('');
  const { t } = useTranslation();
  const { isLoading, mutate } = useAllServices();
  const { mutate: startAll, isLoading: isStartingAll } = useStartAllServices();
  const { mutate: stopAll, isLoading: isStoppingAll } = useStopAllServices();

  useEffect(() => {
    const setup = async () => {
      const unlisten = await listen<{ id: string; status: string }>('envora://service-status', () => {
        mutate();
      });
      return unlisten;
    };
    let unlisten: (() => void) | undefined;
    setup().then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [mutate]);

  useEffect(() => {
    const interval = setInterval(() => mutate(), 5000);
    return () => clearInterval(interval);
  }, [mutate]);

  const handleStartAll = async () => {
    setStartAllError('');
    const results = await startAll({});
    const errors = results
      .filter((service) => service.status === 'error' && service.error)
      .map((service) => `${service.name}: ${service.error}`);
    if (errors.length > 0) {
      setStartAllError(errors.join('\n\n'));
    }
    mutate();
  };

  const handleStopAll = async () => {
    setStartAllError('');
    await stopAll({});
    mutate();
  };

  if (isLoading) {
    return (
      <div className="space-y-5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-32" />
            <Skeleton className="mt-1 h-4 w-56" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-22" />
            <Skeleton className="h-8 w-22" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card-subtle p-4">
              <div className="flex items-center justify-between mb-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-28" />
                <div className="flex gap-2">
                  <Skeleton className="h-7 w-16" />
                  <Skeleton className="h-7 w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t('Dashboard', 'Dashboard')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('Dashboard', 'ServicesOverview')}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleStartAll} disabled={isStartingAll}>
            <Power className="mr-1.5 size-3.5" />
            {t('Dashboard', 'StartAll')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleStopAll} disabled={isStoppingAll}>
            <PowerOff className="mr-1.5 size-3.5" />
            {t('Dashboard', 'StopAll')}
          </Button>
        </div>
      </header>

      {startAllError && (
        <pre className="whitespace-pre-wrap rounded-lg bg-danger/10 p-3 text-xs text-danger">
          {startAllError}
        </pre>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        <ServiceCard serviceType="php-fpm" title="PHP-FPM" />
        <ServiceCard serviceType="nginx" title="Nginx" />
        <ServiceCard serviceType="mysql" title="MySQL" />
      </div>
    </div>
  );
};
