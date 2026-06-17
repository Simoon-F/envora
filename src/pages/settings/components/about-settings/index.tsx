import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const AboutSettings = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">关于</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Envora v0.1.0</p>
          <p>统一的开发环境管理平台。</p>
        </div>
      </CardContent>
    </Card>
  );
};
