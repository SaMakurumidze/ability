import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { useSegments } from 'expo-router';
import { Wallet, Bell, History, Settings } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import * as SecureStore from 'expo-secure-store';

const HISTORY_LAST_SEEN_KEY = 'history_last_seen_at';
const UPDATES_LAST_SEEN_KEY = 'updates_last_seen_at';

export default function TabLayout() {
  const { theme } = useTheme();
  const { session, getToken } = useAuth();
  const segments = useSegments();
  const isDark = theme === 'dark';
  const [historyBadgeCount, setHistoryBadgeCount] = useState(0);
  const [updatesBadgeCount, setUpdatesBadgeCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const inHistoryTab = segments[1] === 'history';

    const refreshBadge = async () => {
      if (!session || inHistoryTab) {
        if (!cancelled) setHistoryBadgeCount(0);
        return;
      }
      try {
        const token = await getToken();
        if (!token) {
          if (!cancelled) setHistoryBadgeCount(0);
          return;
        }
        const res = await apiFetch('/api/transactions', token);
        if (!res.ok) {
          if (!cancelled) setHistoryBadgeCount(0);
          return;
        }
        const payload = await res.json();
        const txs = Array.isArray(payload.transactions) ? payload.transactions : [];
        const lastSeen = await SecureStore.getItemAsync(HISTORY_LAST_SEEN_KEY);
        const unseen = txs.filter((tx: { created_at?: string }) => {
          if (!tx?.created_at) return false;
          if (!lastSeen) return true;
          return new Date(tx.created_at).getTime() > new Date(lastSeen).getTime();
        }).length;
        if (!cancelled) setHistoryBadgeCount(unseen);
      } catch {
        if (!cancelled) setHistoryBadgeCount(0);
      }
    };

    void refreshBadge();
    const id = setInterval(() => {
      void refreshBadge();
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session, getToken, segments]);

  useEffect(() => {
    let cancelled = false;
    const inUpdatesTab = segments[1] === 'updates';

    const refreshBadge = async () => {
      if (!session || inUpdatesTab) {
        if (!cancelled) setUpdatesBadgeCount(0);
        return;
      }
      try {
        const token = await getToken();
        if (!token) {
          if (!cancelled) setUpdatesBadgeCount(0);
          return;
        }
        const res = await apiFetch('/api/notifications', token);
        if (!res.ok) {
          if (!cancelled) setUpdatesBadgeCount(0);
          return;
        }
        const payload = await res.json();
        const items = Array.isArray(payload.notifications) ? payload.notifications : [];
        const lastSeen = await SecureStore.getItemAsync(UPDATES_LAST_SEEN_KEY);
        const unseen = items.filter((n: { created_at?: string }) => {
          if (!n?.created_at) return false;
          if (!lastSeen) return true;
          return new Date(n.created_at).getTime() > new Date(lastSeen).getTime();
        }).length;
        if (!cancelled) setUpdatesBadgeCount(unseen);
      } catch {
        if (!cancelled) setUpdatesBadgeCount(0);
      }
    };

    void refreshBadge();
    const id = setInterval(() => {
      void refreshBadge();
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session, getToken, segments]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: isDark ? '#94a3b8' : '#64748b',
        tabBarStyle: {
          backgroundColor: isDark ? '#0f172a' : '#fff',
          borderTopWidth: 1,
          borderTopColor: isDark ? '#1e293b' : '#e2e8f0',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ size, color }) => (
            <Wallet size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="updates"
        options={{
          title: 'Updates',
          tabBarBadge: updatesBadgeCount > 0 ? updatesBadgeCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#ef4444', color: '#fff' },
          tabBarIcon: ({ size, color }) => (
            <Bell size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarBadge: historyBadgeCount > 0 ? historyBadgeCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#ef4444', color: '#fff' },
          tabBarIcon: ({ size, color }) => (
            <History size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ size, color }) => (
            <Settings size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
