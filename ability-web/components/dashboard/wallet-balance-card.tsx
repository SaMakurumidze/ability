'use client';

import { ArrowDownRight, ArrowUpRight, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type WalletBalanceCardProps = {
  balance: string;
  currency?: string;
};

export function WalletBalanceCard({ balance, currency = 'USD' }: WalletBalanceCardProps) {
  return (
    <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium opacity-90">Wallet Balance</CardTitle>
        <Wallet className="h-5 w-5 opacity-80" />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold">{balance}</span>
          <span className="text-sm font-medium opacity-80">{currency}</span>
        </div>
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="secondary" className="flex-1 border-0 bg-white/20 text-primary-foreground hover:bg-white/30">
            <ArrowDownRight className="mr-1 h-4 w-4" />
            Deposit
          </Button>
          <Button size="sm" variant="secondary" className="flex-1 border-0 bg-white/20 text-primary-foreground hover:bg-white/30">
            <ArrowUpRight className="mr-1 h-4 w-4" />
            Withdraw
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
