'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, CreditCard, PiggyBank, TrendingUp } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { ProgressCard } from '@/components/dashboard/progress-card';
import { StatCard } from '@/components/dashboard/stat-card';
import { TransactionTable, type Transaction } from '@/components/dashboard/transaction-table';
import { WalletBalanceCard } from '@/components/dashboard/wallet-balance-card';
import { getMe, getTransactions, type TransactionRow } from '@/lib/api';
import { getStoredToken } from '@/lib/session';

function toCurrency(value: string | number) {
  const numeric = Number(value || 0);
  return `$${numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalizeStatus(status: string): Transaction['status'] {
  const value = status.toLowerCase();
  if (value.includes('fail')) return 'failed';
  if (value.includes('pend')) return 'pending';
  return 'completed';
}

function mapTransactions(rows: TransactionRow[]): Transaction[] {
  return rows.slice(0, 8).map((row) => ({
    id: row.id,
    entity: row.company_name || row.sender_name || row.recipient_name || 'Counterparty',
    description: row.description || row.transaction_type,
    amount: toCurrency(row.amount_usd),
    date: new Date(row.created_at).toLocaleDateString(),
    status: normalizeStatus(row.status),
  }));
}

export default function IssuerDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [walletBalance, setWalletBalance] = useState('0.00');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push('/');
      return;
    }

    (async () => {
      try {
        const [me, tx] = await Promise.all([getMe(token), getTransactions(token)]);
        if (me.wallet_class !== 'issuer_company' && me.wallet_class !== 'issuer_government') {
          setError('This account is not assigned to an Issuer Wallet.');
          router.push('/');
          return;
        }
        setWalletBalance(me.wallet?.balance_usd || '0.00');
        setTransactions(mapTransactions(tx.transactions || []));
      } catch (err: any) {
        setError(err?.message || 'Failed to load dashboard.');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const completedCount = useMemo(() => transactions.filter((tx) => tx.status === 'completed').length, [transactions]);
  const pendingCount = useMemo(() => transactions.filter((tx) => tx.status === 'pending').length, [transactions]);

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading issuer dashboard...</div>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Issuer Dashboard" subtitle="Wallet and investment settlement overview" />
      <div className="flex-1 space-y-6 p-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <WalletBalanceCard balance={toCurrency(walletBalance)} />
          <StatCard title="Completed Transactions" value={String(completedCount)} icon={TrendingUp} />
          <StatCard title="Pending Transactions" value={String(pendingCount)} icon={PiggyBank} />
          <StatCard title="Total Loaded" value={String(transactions.length)} icon={CreditCard} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ProgressCard title="Settlement Completion" subtitle="Recent transaction outcomes" current={completedCount} target={Math.max(transactions.length, 1)} formatValue={(v) => `${Math.round(v)}`} />
          <StatCard
            title="Payment Flow Health"
            value={transactions.length ? `${Math.round((completedCount / transactions.length) * 100)}%` : '0%'}
            description="Based on loaded history"
            icon={ArrowRightLeft}
          />
        </div>

        <TransactionTable title="Recent Investments" transactions={transactions} entityLabel="Counterparty" />
      </div>
    </div>
  );
}
