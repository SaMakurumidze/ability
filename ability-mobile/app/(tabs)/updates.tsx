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
import { Bell, Info, TrendingUp, CircleAlert as AlertCircle } from 'lucide-react-native';

interface Update {
  id: string;
  type: string;
  title: string;
  message: string;
  created_at: string;
  read: boolean;
}

const UPDATES_LAST_SEEN_KEY = 'updates_last_seen_at';

export default function UpdatesScreen() {
  const { user, getToken } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const router = useRouter();
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kycBlocked, setKycBlocked] = useState(false);

  const loadUpdates = async () => {
    if (!user) return;

    try {
      const token = await getToken();
      if (!token) return;

      const response = await apiFetch('/api/notifications', token);
      if (response.status === 403) {
        setKycBlocked(true);
        setUpdates([]);
        return;
      }
      setKycBlocked(false);
      if (!response.ok) throw new Error('Failed to load updates');
      const data = await response.json();
      const items = data.notifications || [];
      setUpdates(items);
      const latest = items[0]?.created_at || new Date().toISOString();
      await SecureStore.setItemAsync(UPDATES_LAST_SEEN_KEY, latest);
    } catch (error) {
      console.error('Error loading updates:', error);
    }

    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      void loadUpdates();
    }, [user])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadUpdates();
  };

  const markAsRead = async (updateId: string) => {
    const token = await getToken();
    if (!token) return;

    await apiFetch(`/api/notifications/${updateId}/read`, token, { method: 'PATCH', body: '{}' });

    setUpdates((prev) =>
      prev.map((update) => (update.id === updateId ? { ...update, read: true } : update))
    );
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'transaction':
        return <TrendingUp size={20} color="#10b981" />;
      case 'alert':
        return <AlertCircle size={20} color="#ef4444" />;
      case 'info':
        return <Info size={20} color="#2563eb" />;
      default:
        return <Bell size={20} color="#64748b" />;
    }
  };

  const getBackgroundColor = (type: string) => {
    switch (type) {
      case 'transaction':
        return '#f0fdf4';
      case 'alert':
        return '#fee2e2';
      case 'info':
        return '#eff6ff';
      default:
        return '#f8fafc';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else if (diffInDays < 7) {
      return `${diffInDays}d ago`;
    }
    return date.toLocaleDateString();
  };

  const isCapitalReceived = (update: Update) =>
    update.type === 'transaction' && update.title.trim().toLowerCase() === 'capital received';

  const parseCapitalReceived = (message: string) => {
    const amount = message.match(/\$\d+(?:\.\d{1,2})?/i)?.[0] ?? 'N/A';
    const from = message.match(/from\s+(.+?)\s+\(/i)?.[1]?.trim() ?? 'N/A';
    const phone = message.match(/\(([^)]+)\)/)?.[1]?.trim() ?? 'N/A';
    const countryOfOrigin = message.match(/Country:\s*([^\.]+)\./i)?.[1]?.trim() ?? 'N/A';
    const ref = message.match(/Ref:\s*(.+)$/i)?.[1]?.trim() ?? 'N/A';
    return { amount, from, phone, countryOfOrigin, ref };
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
        <Text style={[styles.title, { color: '#6366f1' }]}>Updates</Text>
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
              Complete KYC and set your transaction PIN in Settings to receive updates here.
            </Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/settings')}>
              <Text style={styles.settingsLink}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        ) : updates.length === 0 ? (
            <View style={styles.emptyState}>
            <Bell size={48} color="#cbd5e1" />
              <Text style={[styles.emptyText, { color: isDark ? '#e2e8f0' : '#1e293b' }]}>No updates</Text>
              <Text style={[styles.emptySubtext, { color: isDark ? '#94a3b8' : '#64748b' }]}>
              You'll see notifications and announcements here
            </Text>
          </View>
        ) : (
          updates.map((update) => (
            <TouchableOpacity
              key={update.id}
              style={[
                styles.updateCard,
                !update.read && styles.updateCardUnread,
                {
                  backgroundColor: isDark ? '#0f172a' : '#fff',
                  borderColor: isCapitalReceived(update)
                    ? '#6366f1'
                    : isDark
                    ? '#1e293b'
                    : '#e2e8f0',
                },
              ]}
              onPress={() => markAsRead(update.id)}
            >
              <View
                style={[
                  styles.updateIcon,
                  { backgroundColor: getBackgroundColor(update.type) },
                ]}
              >
                {getIcon(update.type)}
              </View>

              <View style={styles.updateContent}>
                <View style={styles.updateHeader}>
                  <Text style={[styles.updateTitle, { color: isDark ? '#e2e8f0' : '#1e293b' }]}>{update.title}</Text>
                  {!update.read && <View style={styles.unreadDot} />}
                </View>
                {isCapitalReceived(update) ? (
                  <View style={styles.capitalInfoBlock}>
                    {(() => {
                      const details = parseCapitalReceived(update.message);
                      return (
                        <>
                          <View style={styles.capitalInfoRow}>
                            <Text style={styles.capitalInfoLabel}>Amount</Text>
                            <Text style={styles.capitalInfoValue}>{details.amount}</Text>
                          </View>
                          <View style={styles.capitalInfoRow}>
                            <Text style={styles.capitalInfoLabel}>Sender</Text>
                            <Text style={styles.capitalInfoValue}>{details.from}</Text>
                          </View>
                          <View style={styles.capitalInfoRow}>
                            <Text style={styles.capitalInfoLabel}>Phone</Text>
                            <Text style={styles.capitalInfoValue}>{details.phone}</Text>
                          </View>
                          <View style={styles.capitalInfoRow}>
                            <Text style={styles.capitalInfoLabel}>Country of origin</Text>
                            <Text style={styles.capitalInfoValue}>{details.countryOfOrigin}</Text>
                          </View>
                          <View style={styles.capitalInfoRow}>
                            <Text style={styles.capitalInfoLabel}>Reference</Text>
                            <Text style={styles.capitalInfoRef}>{details.ref}</Text>
                          </View>
                        </>
                      );
                    })()}
                  </View>
                ) : (
                  <Text style={[styles.updateMessage, { color: isDark ? '#94a3b8' : '#64748b' }]}>{update.message}</Text>
                )}
                <Text style={[styles.updateTime, { color: isDark ? '#94a3b8' : '#94a3b8' }]}>{formatDate(update.created_at)}</Text>
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
    fontSize: 28,
    fontWeight: '700',
    color: '#1e293b',
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
  updateCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  updateCardUnread: {
    borderColor: '#2563eb',
    borderWidth: 2,
  },
  updateIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  updateContent: {
    flex: 1,
  },
  updateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  updateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563eb',
    marginLeft: 8,
  },
  updateMessage: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    marginBottom: 6,
  },
  updateTime: {
    fontSize: 12,
    color: '#94a3b8',
  },
  capitalInfoBlock: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  capitalInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 4,
    gap: 10,
  },
  capitalInfoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  capitalInfoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
    textAlign: 'right',
  },
  capitalInfoRef: {
    fontSize: 12,
    color: '#475569',
    flex: 1,
    textAlign: 'right',
  },
});
