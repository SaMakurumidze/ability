import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { apiFetch } from '@/lib/api';
import { X, TrendingUp, Building2, Check, Circle as XCircle } from 'lucide-react-native';

interface PendingInvestment {
  id: string;
  company_name: string;
  price_per_share: string;
  number_of_shares: number;
  total_amount: string;
  status: string;
  created_at: string;
}

const normalizeInvestmentStatus = (status: string) => {
  const s = String(status || '').toLowerCase();
  if (s === 'pending' || s === 'pending_authorization') return 'Pending Authorization';
  if (s === 'authorized') return 'Authorized';
  if (s === 'rejected' || s === 'cancelled') return 'Rejected';
  return status;
};

export default function InvestModal() {
  const router = useRouter();
  const { user, getToken, signOut } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [investments, setInvestments] = useState<PendingInvestment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [transactionPin, setTransactionPin] = useState('');
  const [kycError, setKycError] = useState('');

  const loadPendingInvestments = async () => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        await signOut();
        Alert.alert('Session expired', 'Please sign in again.');
        router.replace('/auth/login');
        return;
      }

      const response = await apiFetch('/api/pending-investments', token);
      if (response.status === 401) {
        await signOut();
        Alert.alert('Session expired', 'Please sign in again.');
        router.replace('/auth/login');
        return;
      }
      if (response.status === 403) {
        const err = await response.json().catch(() => ({}));
        setKycError(err.error || 'Complete KYC in Settings first.');
        setInvestments([]);
        return;
      }
      if (!response.ok) {
        const raw = await response.text();
        let msg = 'Failed to load investments';
        try {
          const parsed = raw ? JSON.parse(raw) : {};
          if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
            msg = parsed.error;
          }
        } catch {
          if (raw && raw.trim()) msg = raw.trim().slice(0, 200);
        }
        throw new Error(`${msg} (HTTP ${response.status})`);
      }
      setKycError('');
      const data = await response.json();
      setInvestments(data.investments || []);
    } catch (error) {
      console.error('Error loading investments:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPendingInvestments();
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    loadPendingInvestments();
  };

  const handleAuthorize = async (investment: PendingInvestment) => {
    if (!/^\d{6}$/.test(transactionPin.trim())) {
      alert('Enter your 6-digit transaction PIN (from Settings).');
      return;
    }
    setProcessingId(investment.id);

    try {
      const token = await getToken();
      if (!token) return;

      const response = await apiFetch(
        `/api/pending-investments/${investment.id}/authorize`,
        token,
        { method: 'POST', body: JSON.stringify({ pin: transactionPin.trim() }) }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        alert(err.error || 'Authorization failed');
        return;
      }

      loadPendingInvestments();
    } catch (error) {
      alert('Authorization failed');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (investment: PendingInvestment) => {
    if (!/^\d{6}$/.test(transactionPin.trim())) {
      alert('Enter your 6-digit transaction PIN (from Settings).');
      return;
    }
    setProcessingId(investment.id);

    try {
      const token = await getToken();
      if (!token) return;

      const response = await apiFetch(
        `/api/pending-investments/${investment.id}/decline`,
        token,
        { method: 'POST', body: JSON.stringify({ pin: transactionPin.trim() }) }
      );

      if (!response.ok) {
        alert('Decline failed');
        return;
      }

      loadPendingInvestments();
    } catch (error) {
      alert('Decline failed');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <Modal animationType="slide" transparent={false} visible={true}>
        <View style={[styles.container, { backgroundColor: isDark ? '#020617' : '#f8fafc' }]}>
          <View style={[styles.header, { backgroundColor: isDark ? '#0f172a' : '#fff', borderBottomColor: isDark ? '#1e293b' : '#e2e8f0' }]}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <X size={24} color="#1e293b" />
            </TouchableOpacity>
            <Text style={[styles.title, { color: isDark ? '#e2e8f0' : '#1e293b' }]}>Invest</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal animationType="slide" transparent={false} visible={true}>
      <View style={[styles.container, { backgroundColor: isDark ? '#020617' : '#f8fafc' }]}>
        <View style={[styles.header, { backgroundColor: isDark ? '#0f172a' : '#fff', borderBottomColor: isDark ? '#1e293b' : '#e2e8f0' }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <X size={24} color="#1e293b" />
          </TouchableOpacity>
          <Text style={[styles.title, { color: '#6366f1' }]}>Pending Investments</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {kycError ? (
            <Text style={styles.kycErrorText}>{kycError}</Text>
          ) : null}

          <View style={styles.pinSection}>
            <Text style={styles.pinLabel}>Transaction PIN (6 digits)</Text>
            <TextInput
              style={styles.pinInput}
              placeholder="Enter PIN to authorize or cancel"
              placeholderTextColor="#94a3b8"
              value={transactionPin}
              onChangeText={setTransactionPin}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
            />
          </View>

          {investments.length === 0 ? (
            <View style={styles.emptyState}>
              <TrendingUp size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>No pending investments</Text>
              <Text style={styles.emptySubtext}>
                Investment opportunities will appear here for authorization
              </Text>
            </View>
          ) : (
            investments.map((investment) => (
              <View key={investment.id} style={[styles.investmentCard, { backgroundColor: isDark ? '#0f172a' : '#fff', borderColor: isDark ? '#1e293b' : '#e2e8f0' }]}>
                <View style={styles.investmentHeader}>
                  <View style={styles.companyInfo}>
                    <View style={styles.companyIcon}>
                      <Building2 size={24} color="#10b981" />
                    </View>
                    <Text style={styles.companyName}>{investment.company_name}</Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>{normalizeInvestmentStatus(investment.status)}</Text>
                  </View>
                </View>

                <View style={styles.investmentDetails}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Price per Share</Text>
                    <Text style={styles.detailValue}>
                      ${parseFloat(investment.price_per_share).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Number of Shares</Text>
                    <Text style={styles.detailValue}>{investment.number_of_shares}</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.detailRow}>
                    <Text style={styles.totalLabel}>Total Amount</Text>
                    <Text style={styles.totalValue}>
                      ${parseFloat(investment.total_amount).toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={styles.investmentActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => handleDecline(investment)}
                    disabled={processingId === investment.id}
                  >
                    {processingId === investment.id ? (
                      <ActivityIndicator size="small" color="#ef4444" />
                    ) : (
                      <>
                        <XCircle size={18} color="#ef4444" />
                        <Text style={styles.cancelButtonText}>Decline</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.authorizeButton}
                    onPress={() => handleAuthorize(investment)}
                    disabled={processingId === investment.id}
                  >
                    {processingId === investment.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Check size={18} color="#fff" />
                        <Text style={styles.authorizeButtonText}>Authorize</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  kycErrorText: {
    color: '#b45309',
    backgroundColor: '#fffbeb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 14,
    lineHeight: 20,
  },
  pinSection: {
    marginBottom: 20,
  },
  pinLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  pinInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    letterSpacing: 4,
    color: '#1e293b',
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
  investmentCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  investmentHeader: {
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  companyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  companyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  companyName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    flex: 1,
  },
  statusBadge: {
    borderWidth: 1,
    borderColor: '#6366f1',
    backgroundColor: '#eef2ff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    color: '#4338ca',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  investmentDetails: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10b981',
  },
  investmentActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  cancelButtonText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600',
  },
  authorizeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10b981',
    padding: 14,
    borderRadius: 12,
  },
  authorizeButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
