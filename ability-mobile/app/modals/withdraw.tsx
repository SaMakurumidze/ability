import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { X, ArrowLeft, Building2, Wallet as WalletIcon, User, Check } from 'lucide-react-native';

type Step = 'method' | 'bank' | 'account' | 'amount' | 'authorize';
type WithdrawMethod = 'bank' | 'mobile_money' | 'agent';

interface Bank {
  id: string;
  name: string;
  code: string;
}

const MOBILE_MONEY_BY_COUNTRY: Record<string, string[]> = {
  Zimbabwe: ['EcoCash', 'OneMoney', 'Telecash', "O'mari"],
  Kenya: ['M-Pesa', 'Airtel Money', 'Equitel Money'],
  Uganda: ['MTN Mobile Money', 'Airtel Money', 'Africell Money'],
  Tanzania: ['M-Pesa', 'Tigo Pesa', 'Airtel Money', 'Halopesa'],
  Ghana: ['MTN Mobile Money', 'Vodafone Cash', 'AirtelTigo Money'],
  Nigeria: ['Paga', 'OPay', 'PalmPay', 'MTN MoMo Payment Service Bank'],
  'South Africa': ['MTN MoMo', 'FNB eWallet', 'Standard Bank Instant Money'],
  Rwanda: ['MTN Mobile Money', 'Airtel Money'],
  Zambia: ['MTN Mobile Money', 'Airtel Money', 'Zamtel Kwacha'],
  Mozambique: ['M-Pesa', 'mKesh', 'eMola'],
  Senegal: ['Orange Money', 'Wave', 'Free Money'],
  "Cote d'Ivoire": ['Orange Money', 'MTN MoMo', 'Wave'],
  Egypt: ['Vodafone Cash', 'Orange Money', 'Etisalat Cash'],
};

function normalizeCountry(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .trim();
}

export default function WithdrawModal() {
  const router = useRouter();
  const { user, getToken } = useAuth();
  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<WithdrawMethod | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountValid, setAccountValid] = useState(false);
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState('0.00');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userCountry, setUserCountry] = useState('');
  const [transactionPin, setTransactionPin] = useState('');
  const [banksError, setBanksError] = useState('');
  const [selectedMobileProvider, setSelectedMobileProvider] = useState('');
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);
  const amountNum = Number(amount);
  const balanceNum = Number(balance);
  const amountExceedsBalance =
    Number.isFinite(amountNum) &&
    Number.isFinite(balanceNum) &&
    amountNum > 0 &&
    amountNum > balanceNum;

  useEffect(() => {
    loadUserData();
  }, [user]);

  const loadUserData = async () => {
    if (!user) return;

    const token = await getToken();
    if (!token) return;

    const response = await apiFetch('/api/me', token);
    if (!response.ok) return;

    const data = await response.json();
    setUserCountry(data.profile?.country || 'Zimbabwe');
    if (data.wallet?.balance_usd !== undefined) {
      setBalance(String(data.wallet.balance_usd));
    }
  };

  const loadBanks = async () => {
    const country = userCountry.trim();
    if (!country) {
      setBanksError('Country is missing in your profile. Update Settings and try again.');
      setBanks([]);
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const response = await apiFetch(
        `/api/banks?country=${encodeURIComponent(country)}`,
        token
      );
      if (response.status === 401) {
        setBanksError('Session expired. Please sign in again.');
        setBanks([]);
        return;
      }
      if (response.status === 403) {
        const err = await response.json().catch(() => ({}));
        setBanksError(err.error || 'Complete KYC in Settings.');
        setBanks([]);
        return;
      }
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setBanksError(err.error || `Unable to load banks right now (HTTP ${response.status}).`);
        setBanks([]);
        return;
      }
      setBanksError('');
      const data = await response.json();
      setBanks(data.banks || []);
    } catch (error) {
      console.error('Error loading banks:', error);
      setBanksError('Unable to load banks. Check your connection and try again.');
      setBanks([]);
    } finally {
      setLoading(false);
    }
  };

  const verifyAccount = async () => {
    setLoading(true);
    setError('');

    try {
      if (method === 'mobile_money' && !selectedMobileProvider) {
        setError('Select a mobile money service provider.');
        setLoading(false);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setAccountValid(true);
      setStep('amount');
    } catch (err) {
      setError('Account verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAuthorize = async () => {
    if (!/^\d{6}$/.test(transactionPin.trim())) {
      setError('Enter your 6-digit transaction PIN.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const amountNum = parseFloat(amount);
      const balanceNum = parseFloat(balance);

      if (amountNum > balanceNum) {
        setError('Insufficient capital balance');
        setLoading(false);
        return;
      }

      const token = await getToken();
      if (!token) {
        setError('Not signed in');
        return;
      }

      const response = await apiFetch('/api/wallet/withdraw', token, {
        method: 'POST',
        body: JSON.stringify({
          amountUsd: amountNum,
          description:
            method === 'bank'
              ? `Withdrawal to ${selectedBank?.name} - ${accountNumber}`
              : method === 'mobile_money'
              ? `Withdrawal to ${selectedMobileProvider} - ${accountNumber}`
              : `Withdrawal to agent - ${accountNumber}`,
          pin: transactionPin.trim(),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setError(err.error || 'Withdrawal failed');
        return;
      }

      router.back();
    } catch (err) {
      setError('Withdrawal failed');
    } finally {
      setLoading(false);
    }
  };

  const mobileMoneyProviders =
    MOBILE_MONEY_BY_COUNTRY[normalizeCountry(userCountry)] ?? [];

  return (
    <Modal animationType="slide" transparent={false} visible={true}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => (step === 'method' ? router.back() : setStep('method'))}
            style={styles.backButton}
          >
            {step === 'method' ? <X size={24} color="#1e293b" /> : <ArrowLeft size={24} color="#1e293b" />}
          </TouchableOpacity>
          <Text style={styles.title}>Withdraw Capital</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content}>
          {step === 'method' && (
            <View>
              <Text style={styles.methodStepTitle}>Select Withdrawal Method</Text>

              <TouchableOpacity
                style={styles.methodCard}
                onPress={() => {
                  setMethod('bank');
                  loadBanks();
                  setStep('bank');
                }}
              >
                <View style={[styles.methodIcon, { backgroundColor: '#eff6ff' }]}>
                  <Building2 size={24} color="#2563eb" />
                </View>
                <View style={styles.methodContent}>
                  <Text style={styles.methodTitle}>Bank Account</Text>
                  <Text style={styles.methodSubtitle}>Transfer capital to your bank account</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.methodCard}
                onPress={() => {
                  setMethod('mobile_money');
                  setSelectedMobileProvider('');
                  setProviderDropdownOpen(false);
                  setStep('account');
                }}
              >
                <View style={[styles.methodIcon, { backgroundColor: '#f0fdf4' }]}>
                  <WalletIcon size={24} color="#10b981" />
                </View>
                <View style={styles.methodContent}>
                  <Text style={styles.methodTitle}>Mobile Money Wallet</Text>
                  <Text style={styles.methodSubtitle}>Send capital to mobile money wallet</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.methodCard}
                onPress={() => {
                  setMethod('agent');
                  setStep('account');
                }}
              >
                <View style={[styles.methodIcon, { backgroundColor: '#fef3c7' }]}>
                  <User size={24} color="#f59e0b" />
                </View>
                <View style={styles.methodContent}>
                  <Text style={styles.methodTitle}>Agent</Text>
                  <Text style={styles.methodSubtitle}>Collect capital in cash from agent</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {step === 'bank' && (
            <View>
              <Text style={styles.bankStepTitle}>Select Your Bank</Text>

              {banksError ? <Text style={styles.kycErrorText}>{banksError}</Text> : null}

              {loading ? (
                <ActivityIndicator size="large" color="#2563eb" />
              ) : banks.length === 0 ? (
                !banksError ? (
                  <Text style={styles.emptyText}>No banks available for your country</Text>
                ) : null
              ) : (
                banks.map((bank) => (
                  <TouchableOpacity
                    key={bank.id}
                    style={[
                      styles.bankCard,
                      selectedBank?.id === bank.id && styles.bankCardSelected,
                    ]}
                    onPress={() => {
                      setSelectedBank(bank);
                      setStep('account');
                    }}
                  >
                    <View style={styles.bankIcon}>
                      <Building2 size={20} color="#2563eb" />
                    </View>
                    <Text style={styles.bankName}>{bank.name}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {step === 'account' && (
            <View>
              <Text
                style={
                  method === 'mobile_money'
                    ? styles.walletStepTitle
                    : method === 'agent'
                    ? styles.agentStepTitle
                    : method === 'bank'
                    ? styles.bankDetailsStepTitle
                    : styles.stepTitle
                }
              >
                {method === 'mobile_money'
                  ? 'Enter Wallet Details'
                  : method === 'agent'
                  ? 'Enter Agent Details'
                  : method === 'bank'
                  ? 'Enter Bank Details'
                  : 'Enter Account Details'}
              </Text>

              {method === 'mobile_money' ? (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Mobile Money Service Provider</Text>
                  {mobileMoneyProviders.length > 0 ? (
                    <>
                      <TouchableOpacity
                        style={styles.providerDropdown}
                        onPress={() => setProviderDropdownOpen((v) => !v)}
                      >
                        <Text
                          style={[
                            styles.providerDropdownText,
                            !selectedMobileProvider && styles.providerPlaceholder,
                          ]}
                        >
                          {selectedMobileProvider || 'Select provider'}
                        </Text>
                        <Text style={styles.providerChevron}>{providerDropdownOpen ? '▲' : '▼'}</Text>
                      </TouchableOpacity>
                      {providerDropdownOpen ? (
                        <View style={styles.providerList}>
                          {mobileMoneyProviders.map((provider) => (
                            <TouchableOpacity
                              key={provider}
                              style={styles.providerItem}
                              onPress={() => {
                                setSelectedMobileProvider(provider);
                                setProviderDropdownOpen(false);
                              }}
                            >
                              <Text style={styles.providerItemText}>{provider}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.emptyText}>
                      No configured mobile money providers found for your country ({userCountry || 'Unknown'}).
                    </Text>
                  )}
                </View>
              ) : null}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  {method === 'bank' ? 'Account Number' : method === 'mobile_money' ? 'Mobile Number' : 'Agent ID'}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    method === 'mobile_money' || method === 'agent' || method === 'bank'
                      ? { borderColor: '#6366f1' }
                      : null,
                  ]}
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  placeholder={
                    method === 'bank'
                      ? '1234567890'
                      : method === 'mobile_money'
                      ? '+1234567890'
                      : 'AG-12345'
                  }
                  keyboardType={
                    method === 'agent'
                      ? 'default'
                      : method === 'mobile_money'
                      ? 'phone-pad'
                      : 'numeric'
                  }
                  placeholderTextColor="#94a3b8"
                />
              </View>

              {method === 'bank' && selectedBank && (
                <View style={styles.bankInfo}>
                  <Text style={styles.bankInfoLabel}>Selected Bank</Text>
                  <Text style={styles.bankInfoValue}>{selectedBank.name}</Text>
                </View>
              )}

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={verifyAccount}
                  disabled={
                    loading ||
                    !accountNumber ||
                    (method === 'mobile_money' &&
                      (mobileMoneyProviders.length === 0 || !selectedMobileProvider))
                  }
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Verify Account</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {step === 'amount' && (
            <View>
              <Text style={styles.amountStepTitle}>Enter Capital Amount</Text>

              <View style={styles.balanceInfo}>
                <Text style={styles.balanceLabel}>Available Capital Balance</Text>
                <Text style={styles.balanceValue}>${parseFloat(balance).toFixed(2)}</Text>
              </View>

              <View style={styles.amountContainer}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor="#cbd5e1"
                  autoFocus
                />
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {amountExceedsBalance ? (
                <Text style={styles.errorText}>
                  Entered amount exceeds your available capital balance.
                </Text>
              ) : null}

              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep('account')}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    amountExceedsBalance && styles.primaryButtonDisabled,
                  ]}
                  onPress={() => setStep('authorize')}
                  disabled={!amount || parseFloat(amount) <= 0 || amountExceedsBalance}
                >
                  <Text style={styles.primaryButtonText}>Continue</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {step === 'authorize' && (
            <View>
              <Text style={styles.authorizeStepTitle}>Authorize Withdrawal</Text>

              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Method</Text>
                  <Text style={styles.summaryValue}>
                    {method === 'bank' ? 'Bank Account' : method === 'mobile_money' ? 'Mobile Money' : 'Agent'}
                  </Text>
                </View>

                {method === 'bank' && selectedBank && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Bank</Text>
                    <Text style={styles.summaryValue}>{selectedBank.name}</Text>
                  </View>
                )}
                {method === 'mobile_money' && selectedMobileProvider ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Provider</Text>
                    <Text style={styles.summaryValue}>{selectedMobileProvider}</Text>
                  </View>
                ) : null}

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Account</Text>
                  <Text style={styles.summaryValue}>{accountNumber}</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.amountSummary}>
                  <Text style={styles.amountSummaryLabel}>Withdrawal Amount</Text>
                  <Text style={styles.amountSummaryValue}>${parseFloat(amount).toFixed(2)}</Text>
                </View>
              </View>

              <Text style={styles.pinLabel}>Transaction PIN</Text>
              <TextInput
                style={styles.pinInput}
                placeholder="6-digit PIN"
                placeholderTextColor="#94a3b8"
                value={transactionPin}
                onChangeText={setTransactionPin}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={6}
                editable={!loading}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setStep('amount')}
                  disabled={loading}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, styles.authorizeButton]}
                  onPress={handleAuthorize}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Check size={18} color="#fff" />
                      <Text style={styles.primaryButtonText}>Authorize</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
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
    color: '#6366f1',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 24,
  },
  walletStepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#6366f1',
    marginBottom: 24,
  },
  amountStepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#6366f1',
    marginBottom: 24,
  },
  bankDetailsStepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#6366f1',
    marginBottom: 24,
  },
  agentStepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#6366f1',
    marginBottom: 24,
  },
  authorizeStepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#6366f1',
    marginBottom: 24,
  },
  bankStepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#6366f1',
    marginBottom: 24,
  },
  methodStepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#6366f1',
    marginBottom: 24,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  methodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  methodContent: {
    flex: 1,
  },
  methodTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6366f1',
    marginBottom: 2,
  },
  methodSubtitle: {
    fontSize: 13,
    color: '#64748b',
  },
  bankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  bankCardSelected: {
    borderColor: '#6366f1',
    borderWidth: 2,
    backgroundColor: '#eef2ff',
  },
  bankIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  bankName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6366f1',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1e293b',
  },
  providerDropdown: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#6366f1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  providerDropdownText: {
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '500',
  },
  providerPlaceholder: {
    color: '#94a3b8',
    fontWeight: '400',
  },
  providerChevron: {
    color: '#6366f1',
    fontSize: 12,
  },
  providerList: {
    borderWidth: 1,
    borderColor: '#6366f1',
    borderRadius: 12,
    marginTop: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  providerItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  providerItemText: {
    fontSize: 14,
    color: '#6366f1',
    fontWeight: '600',
  },
  bankInfo: {
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  bankInfoLabel: {
    fontSize: 12,
    color: '#2563eb',
    marginBottom: 4,
  },
  bankInfoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
  },
  balanceInfo: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  balanceLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#6366f1',
    marginBottom: 16,
  },
  currencySymbol: {
    fontSize: 32,
    fontWeight: '700',
    color: '#64748b',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: '700',
    color: '#1e293b',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#6366f1',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    flex: 1,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6366f1',
    flex: 1,
  },
  secondaryButtonText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#6366f1',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 12,
  },
  amountSummary: {
    backgroundColor: '#fef3c7',
    padding: 16,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountSummaryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400e',
  },
  amountSummaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#92400e',
  },
  authorizeButton: {
    backgroundColor: '#f59e0b',
  },
  kycErrorText: {
    color: '#b45309',
    backgroundColor: '#fffbeb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  pinLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginTop: 8,
    marginBottom: 8,
  },
  pinInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#6366f1',
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    letterSpacing: 4,
    color: '#1e293b',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 32,
  },
});
