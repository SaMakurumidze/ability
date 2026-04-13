'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight, CheckCircle, Clock } from 'lucide-react';
import { ActivityChart } from '@/components/dashboard/activity-chart';
import { DashboardHeader } from '@/components/dashboard/header';
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
  return rows.slice(0, 10).map((row) => ({
    id: row.id,
    entity: row.sender_name || row.company_name || row.recipient_name || 'Counterparty',
    description: row.description || row.transaction_type,
    amount: toCurrency(row.amount_usd),
    date: new Date(row.created_at).toLocaleDateString(),
    status: normalizeStatus(row.status),
  }));
}

function buildActivityData(rows: TransactionRow[]) {
  const monthBuckets: Record<string, number> = {};
  rows.forEach((row) => {
    const date = new Date(row.created_at);
    const key = date.toLocaleString('en-US', { month: 'short' });
    monthBuckets[key] = (monthBuckets[key] || 0) + Number(row.amount_usd || 0);
  });
  return Object.entries(monthBuckets).map(([name, value]) => ({ name, value }));
}

export default function BusinessDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [walletBalance, setWalletBalance] = useState('0.00');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activityData, setActivityData] = useState<Array<{ name: string; value: number }>>([]);
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
        if (me.wallet_class !== 'business_vendor' && me.wallet_class !== 'business_contractor') {
          setError('This account is not assigned to a Business Wallet.');
          router.push('/');
          return;
        }
        setWalletBalance(me.wallet?.balance_usd || '0.00');
        setTransactions(mapTransactions(tx.transactions || []));
        setActivityData(buildActivityData(tx.transactions || []));
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
    return <div className="p-6 text-muted-foreground">Loading business dashboard...</div>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Business Dashboard" subtitle="Operational wallet and settlements overview" />

      <div className="flex-1 space-y-6 p-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <WalletBalanceCard balance={toCurrency(walletBalance)} />
          <StatCard title="Revenue Received" value={toCurrency(completedCount * 1000)} icon={ArrowDownLeft} />
          <StatCard title="Pending Payments" value={String(pendingCount)} icon={Clock} />
          <StatCard title="Settled This Period" value={String(completedCount)} icon={CheckCircle} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ActivityChart title="Revenue Trend" data={activityData.length ? activityData : [{ name: 'N/A', value: 0 }]} />
          <div className="space-y-4">
            <StatCard title="Incoming Payments" value={toCurrency(completedCount * 1000)} icon={ArrowDownLeft} />
            <StatCard title="Outgoing Payments" value={toCurrency(pendingCount * 1000)} icon={ArrowUpRight} />
          </div>
        </div>

        <TransactionTable title="Vendor Transactions" transactions={transactions} entityLabel="Counterparty" />
      </div>
    </div>
  );
}
