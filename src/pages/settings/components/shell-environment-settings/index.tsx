import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import type { ShellEnvironmentStatus } from '@/types/settings';
import { CheckCircle2, Loader2, Terminal } from 'lucide-react';

interface ShellEnvironmentSettingsProps {
  binDir: string | undefined;
  shellEnv: ShellEnvironmentStatus | undefined;
  isInstalling: boolean;
  onInstall: () => void;
}

export const ShellEnvironmentSettings = ({
  binDir,
  shellEnv,
  isInstalling,
  onInstall,
}: ShellEnvironmentSettingsProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Terminal className="h-4 w-4" />
          Shell 环境
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={shellEnv?.is_installed ? 'default' : 'secondary'}>
              {shellEnv?.is_installed ? '已写入' : '未写入'}
            </Badge>
            <span className="text-xs text-muted-foreground">新开终端后生效</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={shellEnv?.profile_installed ? 'outline' : 'secondary'}>
              Profile {shellEnv?.profile_installed ? '已写入' : '未写入'}
            </Badge>
            <Badge variant={shellEnv?.user_path_installed ? 'outline' : 'secondary'}>
              PATH {shellEnv?.user_path_installed ? '已写入' : '未写入'}
            </Badge>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">命令目录</Label>
            <p className="mt-1 break-all font-mono text-sm">{shellEnv?.bin_dir ?? binDir ?? '-'}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">环境脚本</Label>
            <p className="mt-1 break-all font-mono text-sm">{shellEnv?.env_script ?? '-'}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Shell 配置文件</Label>
            <p className="mt-1 break-all font-mono text-sm">{shellEnv?.shell_profile ?? '-'}</p>
          </div>

          <Button size="sm" onClick={onInstall} disabled={isInstalling}>
            {isInstalling ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            {shellEnv?.is_installed ? '重新写入 Shell 环境' : '写入 Shell 环境'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
