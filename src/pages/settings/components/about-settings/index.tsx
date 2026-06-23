import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { APP_VERSION } from '@/lib/version';

export const AboutSettings = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">关于</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Envora v{APP_VERSION}</p>
          <p>统一的开发环境管理平台。</p>
        </div>
      </CardContent>
    </Card>
  );
};
