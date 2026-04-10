import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { apiFetch, getApiBaseUrl } from '@/lib/api';
import { Eye, EyeOff, ArrowLeftRight, TrendingUp, ArrowDownToLine } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

export default function WalletHomeScreen() {
  const { user, getToken, signOut } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const router = useRouter();
  const [balance, setBalance] = useState<string>('0.00');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [fullName, setFullName] = useState('');
  const [kycComplete, setKycComplete] = useState(false);
  const [walletDataLoaded, setWalletDataLoaded] = useState(false);
  const [showInjectInfo, setShowInjectInfo] = useState(true);
  const injectFade = useState(new Animated.Value(1))[0];
  /** Set when fetch to EXPO_PUBLIC_API_URL fails (common with Expo tunnel + LAN API URL). */
  const [apiUnreachableUrl, setApiUnreachableUrl] = useState<string | null>(null);

  const loadData = async () => {
    if (!user) return;

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Missing auth token');
      }

      const response = await apiFetch('/api/me', token);
      if (!response.ok) {
        if (response.status === 401) {
          await signOut();
          setApiUnreachableUrl(null);
          Alert.alert('Session expired', 'Please sign in again.');
          router.replace('/auth/login');
          return;
        }
        if (response.status === 408) {
          setApiUnreachableUrl(getApiBaseUrl());
          setWalletDataLoaded(false);
          return;
        }
        const raw = await response.text();
        let errorMessage = 'Failed to load wallet data';
        try {
          const parsed = raw ? JSON.parse(raw) : null;
          if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
            errorMessage = parsed.error;
          }
        } catch {
          if (raw && raw.trim()) {
            errorMessage = raw.trim().slice(0, 240);
          }
        }
        throw new Error(`${errorMessage} (HTTP ${response.status})`);
      }

      const data = await response.json();
      setKycComplete(Boolean(data.kyc_complete ?? data.profile?.kyc_complete));
      if (data.profile?.full_name) {
        setFullName(data.profile.full_name);
      }
      if (data.wallet?.balance_usd !== undefined) {
        setBalance(String(data.wallet.balance_usd));
      }
      setWalletDataLoaded(true);
      setApiUnreachableUrl(null);
    } catch (error) {
      console.error('Error loading wallet data:', error);
      const isNetwork =
        error instanceof TypeError ||
        (typeof error === 'object' &&
          error !== null &&
          String((error as Error).message ?? '').toLowerCase().includes('network'));
      if (isNetwork) {
        try {
          setApiUnreachableUrl(getApiBaseUrl());
        } catch {
          setApiUnreachableUrl('(configure EXPO_PUBLIC_API_URL)');
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
      setShowInjectInfo(true);
      injectFade.setValue(1);
      const timeout = setTimeout(() => {
        Animated.timing(injectFade, {
          toValue: 0,
          duration: 450,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setShowInjectInfo(false);
        });
      }, 10000);
      return () => clearTimeout(timeout);
    }, [user])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
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
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {apiUnreachableUrl ? (
          <View style={styles.apiErrorBanner}>
            <Text style={styles.apiErrorTitle}>Cannot reach the API</Text>
            <Text style={styles.apiErrorText}>
              This app loads from Expo, but it calls your backend at{' '}
              <Text style={styles.apiErrorMono}>{apiUnreachableUrl}</Text>. Tunnel mode does not route that
              URL—your phone often can’t open a PC LAN address.
            </Text>
            <Text style={styles.apiErrorText}>
              Use the same Wi‑Fi as your PC and run{' '}
              <Text style={styles.apiErrorMono}>npm run start:lan</Text> in ability-mobile, or expose the API
              (e.g. <Text style={styles.apiErrorMono}>npm run tunnel</Text> in ability-api), put the HTTPS URL
              in <Text style={styles.apiErrorMono}>EXPO_PUBLIC_API_URL</Text>, add{' '}
              <Text style={styles.apiErrorMono}>EXPO_LOCK_API_URL=1</Text>, then restart Expo.
            </Text>
          </View>
        ) : null}

        <View style={styles.header}>
          <Text style={styles.welcomeLine}>
            {`Welcome, ${(fullName || user?.fullName || '').trim() || 'Investor'}`}
          </Text>
        </View>

        {walletDataLoaded && !kycComplete ? (
          <TouchableOpacity
            style={styles.kycBanner}
            activeOpacity={0.85}
            onPress={() => router.push('/(tabs)/settings')}
          >
            <Text style={styles.kycBannerTitle}>Complete verification</Text>
            <Text style={styles.kycBannerText}>
              Add country, ID, and transaction PIN in Settings to unlock Xchange, Invest, Withdraw, History,
              and Updates.
            </Text>
            <Text style={styles.kycBannerLink}>Open Settings →</Text>
          </TouchableOpacity>
        ) : null}

        <LinearGradient
          colors={['rgba(37, 99, 235, 0.4)', 'rgba(124, 58, 237, 0.4)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={styles.balanceCardContent}>
            <View style={styles.balanceHeader}>
              <Text style={styles.balanceLabel}>USD Wallet Balance</Text>
              <TouchableOpacity onPress={() => setBalanceVisible(!balanceVisible)}>
                {balanceVisible ? (
                  <Eye size={20} color="#ffffff" />
                ) : (
                  <EyeOff size={20} color="#ffffff" />
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.balanceAmount}>
              {!walletDataLoaded
                ? 'Unavailable'
                : balanceVisible
                ? `$${parseFloat(balance).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : '••••••'}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              !kycComplete && styles.actionButtonDisabled,
            ]}
            onPress={() => {
              if (!kycComplete) {
                Alert.alert(
                  'Verification required',
                  'Complete KYC and set your transaction PIN in Settings before using wallet actions.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Settings', onPress: () => router.push('/(tabs)/settings') },
                  ]
                );
                return;
              }
              router.push('/modals/xchange');
            }}
          >
            <View style={[styles.actionIconContainer, { backgroundColor: '#eff6ff' }]}>
              <ArrowLeftRight size={24} color="#2563eb" />
            </View>
            <Text style={styles.actionLabel}>Xchange</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionButton,
              !kycComplete && styles.actionButtonDisabled,
            ]}
            onPress={() => {
              if (!kycComplete) {
                Alert.alert(
                  'Verification required',
                  'Complete KYC and set your transaction PIN in Settings before using wallet actions.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Settings', onPress: () => router.push('/(tabs)/settings') },
                  ]
                );
                return;
              }
              router.push('/modals/invest');
            }}
          >
            <View style={[styles.actionIconContainer, { backgroundColor: '#f0fdf4' }]}>
              <TrendingUp size={24} color="#10b981" />
            </View>
            <Text style={styles.actionLabel}>Invest</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionButton,
              !kycComplete && styles.actionButtonDisabled,
            ]}
            onPress={() => {
              if (!kycComplete) {
                Alert.alert(
                  'Verification required',
                  'Complete KYC and set your transaction PIN in Settings before using wallet actions.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Settings', onPress: () => router.push('/(tabs)/settings') },
                  ]
                );
                return;
              }
              router.push('/modals/withdraw');
            }}
          >
            <View style={[styles.actionIconContainer, { backgroundColor: '#fef3c7' }]}>
              <ArrowDownToLine size={24} color="#f59e0b" />
            </View>
            <Text style={styles.actionLabel}>Withdraw</Text>
          </TouchableOpacity>
        </View>

        {showInjectInfo ? (
          <Animated.View style={[styles.infoBox, { opacity: injectFade }]}>
            <Text style={styles.infoTitle}>Injecting Capital</Text>
            <Text style={styles.infoText}>
              Capital injections are processed externally via your banking app, mobile money wallet, or agent. Capital will appear in your wallet automatically.
            </Text>
          </Animated.View>
        ) : null}
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
  scrollView: {
    flex: 1,
  },
  apiErrorBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  apiErrorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#b91c1c',
    marginBottom: 8,
  },
  apiErrorText: {
    fontSize: 13,
    color: '#7f1d1d',
    lineHeight: 19,
    marginBottom: 8,
  },
  apiErrorMono: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#991b1b',
  },
  header: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#fff',
  },
  welcomeLine: {
    fontSize: 28,
    fontWeight: '700',
    color: '#6366f1',
  },
  kycBanner: {
    marginHorizontal: 24,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  kycBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#b45309',
    marginBottom: 6,
  },
  kycBannerText: {
    fontSize: 13,
    color: '#92400e',
    lineHeight: 18,
  },
  kycBannerLink: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  balanceCard: {
    margin: 24,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.9)',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 5,
  },
  balanceCardContent: {
    zIndex: 1,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
    textShadowColor: 'rgba(15,23,42,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  balanceAmount: {
    fontSize: 40,
    fontWeight: '700',
    color: '#fff',
    marginTop: 8,
    textShadowColor: 'rgba(15,23,42,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  actionsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  actionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366f1',
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  infoBox: {
    backgroundColor: '#eff6ff',
    marginHorizontal: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6366f1',
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563eb',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 18,
  },
});
