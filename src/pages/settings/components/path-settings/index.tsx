import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import type { AppSettings } from '@/types/settings';

interface PathSettingsProps {
  settings: AppSettings | undefined;
  isLoading: boolean;
}

export const PathSettings = ({ settings, isLoading }: PathSettingsProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">路径</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">加载中...</p>
        ) : settings ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">数据目录</Label>
              <p className="mt-1 font-mono text-sm">{settings.data_dir}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">运行环境目录</Label>
              <p className="mt-1 font-mono text-sm">{settings.runtime_dir}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">可执行文件目录</Label>
              <p className="mt-1 font-mono text-sm">{settings.bin_dir}</p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
