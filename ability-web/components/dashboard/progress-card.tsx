'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

type ProgressCardProps = {
  title: string;
  subtitle?: string;
  current: number;
  target: number;
  formatValue?: (value: number) => string;
};

export function ProgressCard({
  title,
  subtitle,
  current,
  target,
  formatValue = (value) => `$${(value / 1000000).toFixed(1)}M`,
}: ProgressCardProps) {
  const percentage = Math.min((current / Math.max(target, 1)) * 100, 100);

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Progress value={percentage} className="h-2" />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Raised: <span className="font-medium text-foreground">{formatValue(current)}</span>
            </span>
            <span className="text-muted-foreground">
              Target: <span className="font-medium text-foreground">{formatValue(target)}</span>
            </span>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium text-primary">{percentage.toFixed(1)}% Complete</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
