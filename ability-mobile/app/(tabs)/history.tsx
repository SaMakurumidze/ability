import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { apiFetch } from '@/lib/api';
import * as SecureStore from 'expo-secure-store';
import {
  ArrowLeftRight,
  TrendingUp,
  ArrowDownToLine,
  DollarSign,
  ChevronRight,
} from 'lucide-react-native';

interface Transaction {
  id: string;
  transaction_type: string;
  amount_usd: string;
  status: string;
  created_at: string;
  description?: string;
  sender_name?: string;
  sender_phone?: string;
  recipient_name?: string;
  recipient_phone?: string;
  company_name?: string;
}

const HISTORY_LAST_SEEN_KEY = 'history_last_seen_at';

export default function HistoryScreen() {
  const { user, getToken } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kycBlocked, setKycBlocked] = useState(false);

  const loadHistory = async () => {
    if (!user) return;

    try {
      const token = await getToken();
      if (!token) return;

      const response = await apiFetch('/api/transactions', token);
      if (response.status === 403) {
        setKycBlocked(true);
        setTransactions([]);
        return;
      }
      setKycBlocked(false);
      if (!response.ok) throw new Error('Failed to load history');
      const data = await response.json();
      const txs = data.transactions || [];
      setTransactions(txs);
      const latest = txs[0]?.created_at || new Date().toISOString();
      await SecureStore.setItemAsync(HISTORY_LAST_SEEN_KEY, latest);
    } catch (error) {
      console.error('Error loading history:', error);
    }

    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
    }, [user])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadHistory();
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'XCHANGE':
        return <ArrowLeftRight size={20} color="#2563eb" />;
      case 'RECEIVE':
        return <DollarSign size={20} color="#10b981" />;
      case 'INVEST':
        return <TrendingUp size={20} color="#10b981" />;
      case 'WITHDRAW':
        return <ArrowDownToLine size={20} color="#f59e0b" />;
      case 'INJECT':
        return <DollarSign size={20} color="#10b981" />;
      default:
        return <DollarSign size={20} color="#64748b" />;
    }
  };

  const getIconBg = (type: string) => {
    switch (type) {
      case 'XCHANGE':
        return '#eff6ff';
      case 'RECEIVE':
        return '#dcfce7';
      case 'INVEST':
        return '#f0fdf4';
      case 'WITHDRAW':
        return '#fef3c7';
      case 'INJECT':
        return '#dcfce7';
      default:
        return '#f8fafc';
    }
  };

  const getDisplayName = (tx: Transaction) => {
    switch (tx.transaction_type) {
      case 'XCHANGE':
        return tx.recipient_name || 'Transfer';
      case 'RECEIVE':
        return tx.sender_name ? `From ${tx.sender_name}` : 'Received Capital';
      case 'INVEST':
        return tx.company_name || 'Investment';
      case 'WITHDRAW':
        return 'Withdrawal';
      case 'INJECT':
        return 'Deposit';
      default:
        return tx.transaction_type;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return `Today at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: isDark ? '#020617' : '#f8fafc' }]}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#020617' : '#f8fafc' }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? '#0f172a' : '#fff',
            borderBottomColor: isDark ? '#1e293b' : '#e2e8f0',
          },
        ]}
      >
        <Text style={styles.title}>Capital Transaction History</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {kycBlocked ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: isDark ? '#e2e8f0' : '#1e293b' }]}>Verification required</Text>
              <Text style={[styles.emptySubtext, { color: isDark ? '#94a3b8' : '#64748b' }]}>
              Complete KYC and set your transaction PIN in Settings to view transaction history.
            </Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/settings')}>
              <Text style={styles.settingsLink}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        ) : transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: isDark ? '#e2e8f0' : '#1e293b' }]}>No capital transactions yet</Text>
              <Text style={[styles.emptySubtext, { color: isDark ? '#94a3b8' : '#64748b' }]}>
              Your capital transaction history will appear here
            </Text>
          </View>
        ) : (
          transactions.map((tx) => (
            <TouchableOpacity
              key={tx.id}
              style={[
                styles.transactionCard,
                { backgroundColor: isDark ? '#0f172a' : '#fff', borderColor: '#6366f1' },
              ]}
            >
              <View style={[styles.transactionIcon, { backgroundColor: getIconBg(tx.transaction_type) }]}>
                {getIcon(tx.transaction_type)}
              </View>

              <View style={styles.transactionContent}>
                <View style={styles.transactionHeader}>
                  <Text style={[styles.transactionTitle, { color: isDark ? '#e2e8f0' : '#1e293b' }]}>{getDisplayName(tx)}</Text>
                  <Text
                    style={[
                      styles.transactionAmount,
                      {
                        color:
                          tx.transaction_type === 'WITHDRAW' || tx.transaction_type === 'INVEST'
                            ? '#ef4444'
                            : '#10b981',
                      },
                    ]}
                  >
                    {tx.transaction_type === 'WITHDRAW' || tx.transaction_type === 'INVEST' ? '-' : '+'}
                    ${parseFloat(String(tx.amount_usd)).toFixed(2)}
                  </Text>
                </View>

                <Text style={[styles.transactionDate, { color: isDark ? '#94a3b8' : '#94a3b8' }]}>{formatDate(tx.created_at)}</Text>

                <View style={styles.transactionFooter}>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          tx.status === 'CONFIRMED'
                            ? '#dcfce7'
                            : tx.status === 'PENDING'
                            ? '#fef3c7'
                            : '#fee2e2',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color:
                            tx.status === 'CONFIRMED'
                              ? '#10b981'
                              : tx.status === 'PENDING'
                              ? '#f59e0b'
                              : '#ef4444',
                        },
                      ]}
                    >
                      {tx.status}
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#cbd5e1" />
                </View>

                <View style={styles.detailBlock}>
                  <Text style={styles.detailText}>
                    <Text style={styles.detailLabel}>Transaction ID: </Text>
                    {tx.id}
                  </Text>
                  <Text style={styles.detailText}>
                    <Text style={styles.detailLabel}>Sender: </Text>
                    {(tx.sender_name || 'You') + (tx.sender_phone ? ` (${tx.sender_phone})` : '')}
                  </Text>
                  <Text style={styles.detailText}>
                    <Text style={styles.detailLabel}>Receiver: </Text>
                    {(tx.recipient_name || 'N/A') + (tx.recipient_phone ? ` (${tx.recipient_phone})` : '')}
                  </Text>
                  <Text style={styles.detailText}>
                    <Text style={styles.detailLabel}>Time: </Text>
                    {new Date(tx.created_at).toLocaleString()}
                  </Text>
                  <Text style={styles.detailText}>
                    <Text style={styles.detailLabel}>Result: </Text>
                    {tx.status === 'CONFIRMED' ? 'Success' : 'Failed'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#6366f1',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
    textAlign: 'center',
  },
  settingsLink: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
    textAlign: 'center',
  },
  transactionCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionContent: {
    flex: 1,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  transactionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  transactionDate: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 8,
  },
  transactionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  detailBlock: {
    marginTop: 10,
    gap: 2,
  },
  detailText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
  },
  detailLabel: {
    fontWeight: '700',
    color: '#334155',
  },
});
