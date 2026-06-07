import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Download, Trash2, Check, Settings2 } from 'lucide-react';
import { useInstalledVersions, useAvailableVersions, useInstallVersion, useUninstallVersion } from '@/hooks/useRuntimes';
import type { RuntimeType, VersionInfo } from '@/types/runtime';
import type { ProgressEvent } from '@/types/runtime';
import { listen } from '@tauri-apps/api/event';

const runtimes: { type: RuntimeType; name: string; icon: string; configPath?: string }[] = [
  { type: 'php', name: 'PHP', icon: '🐘', configPath: '/runtimes/php' },
  { type: 'nginx', name: 'Nginx', icon: '🌐' },
  { type: 'mysql', name: 'MySQL', icon: '🐬' },
];

function RuntimeCard({ runtime }: { runtime: { type: RuntimeType; name: string; icon: string; configPath?: string } }) {
  const navigate = useNavigate();
  const { data: installed, isLoading, mutate } = useInstalledVersions(runtime.type);
  const { data: available } = useAvailableVersions(runtime.type);
  const { mutate: installVersion, isLoading: isInstalling } = useInstallVersion();
  const { mutate: uninstallVersion } = useUninstallVersion();
  const [installProgress, setInstallProgress] = useState<number | null>(null);
  const [installMessage, setInstallMessage] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleInstall = async (version: string) => {
    // Listen for progress events
    const unlisten = await listen<ProgressEvent>('envora://progress', (event) => {
      const payload = event.payload;
      if (
        'runtime' in payload.payload &&
        payload.payload.runtime === runtime.type &&
        payload.payload.version === version
      ) {
        if (payload.type === 'build_progress') {
          setInstallProgress(payload.payload.percent);
          setInstallMessage(payload.payload.message);
        }
      }
    });

    try {
      await installVersion({ runtime: runtime.type, version });
      mutate();
      setDialogOpen(false);
    } finally {
      unlisten();
      setInstallProgress(null);
      setInstallMessage('');
    }
  };

  const handleUninstall = async (version: string) => {
    await uninstallVersion({ runtime: runtime.type, version });
    mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-2xl">{runtime.icon}</span>
          <span>{runtime.name}</span>
          <Badge variant="outline" className="ml-auto">
            {installed?.length ?? 0} installed
          </Badge>
          {runtime.configPath && (installed?.length ?? 0) > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => navigate(runtime.configPath!)}
              title="Configure"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            {/* Installed versions */}
            {installed && installed.length > 0 ? (
              <div className="space-y-2">
                {installed.map((v) => (
                  <div
                    key={v.version}
                    className="flex items-center justify-between p-2 rounded-md border"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{v.version}</span>
                      {v.is_default && (
                        <Badge variant="default" className="text-xs">
                          <Check className="h-3 w-3 mr-1" />
                          Default
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(v.size)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUninstall(v.version)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                No versions installed
              </p>
            )}

            {/* Install progress */}
            {installProgress !== null && (
              <div className="space-y-2">
                <Progress value={installProgress} />
                <p className="text-xs text-muted-foreground">{installMessage}</p>
              </div>
            )}

            {/* Install button */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger render={<Button variant="outline" className="w-full" disabled={isInstalling} />}>
                {isInstalling ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Install Version
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Install {runtime.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                  {available?.map((v: VersionInfo) => (
                    <div
                      key={v.version}
                      className="flex items-center justify-between p-3 rounded-md border hover:bg-muted cursor-pointer"
                      onClick={() => !v.is_installed && handleInstall(v.version)}
                    >
                      <div>
                        <span className="font-mono">{v.version}</span>
                        {v.is_installed && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            Installed
                          </Badge>
                        )}
                      </div>
                      {!v.is_installed && (
                        <Button size="sm" variant="ghost">
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function Runtimes() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Runtimes</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {runtimes.map((runtime) => (
          <RuntimeCard key={runtime.type} runtime={runtime} />
        ))}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
