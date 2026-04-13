'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type Transaction = {
  id: string;
  entity: string;
  description?: string;
  amount: string;
  date: string;
  status: 'completed' | 'pending' | 'failed';
};

type TransactionTableProps = {
  title?: string;
  transactions: Transaction[];
  entityLabel?: string;
};

const statusStyles: Record<Transaction['status'], string> = {
  completed: 'border-accent/20 bg-accent/10 text-accent',
  pending: 'border-chart-4/20 bg-chart-4/10 text-chart-4',
  failed: 'border-destructive/20 bg-destructive/10 text-destructive',
};

export function TransactionTable({ title = 'Recent Transactions', transactions, entityLabel = 'Entity' }: TransactionTableProps) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{entityLabel}</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell className="font-medium">{tx.entity}</TableCell>
                <TableCell className="text-muted-foreground">{tx.description || '-'}</TableCell>
                <TableCell className="text-right font-medium">{tx.amount}</TableCell>
                <TableCell className="text-muted-foreground">{tx.date}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('capitalize', statusStyles[tx.status])}>
                    {tx.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
