'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type StatCardProps = {
  title: string;
  value: string;
  description?: string;
  icon?: LucideIcon;
  trend?: { value: number; isPositive: boolean };
  className?: string;
};

export function StatCard({ title, value, description, icon: Icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn('border-border/50 shadow-sm', className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {(description || trend) && (
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            {trend ? (
              <span className={cn('font-medium', trend.isPositive ? 'text-accent' : 'text-destructive')}>
                {trend.isPositive ? '+' : ''}
                {trend.value}%
              </span>
            ) : null}
            {description ? <span>{description}</span> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
