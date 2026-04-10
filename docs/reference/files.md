AUTHENTICATION FILES
app/auth/login.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Wallet } from 'lucide-react-native';
import PhoneInput from '@/components/PhoneInput';

export default function LoginScreen() {
  const [countryCode, setCountryCode] = useState('+1');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { signIn } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    if (!phoneNumber || !pin) {
      setError('Please enter phone number and PIN');
      return;
    }

    if (pin.length !== 6) {
      setError('PIN must be 6 digits');
      return;
    }

    setLoading(true);
    setError('');

    const fullPhone = `${countryCode}${phoneNumber}`;
    const { error: signInError } = await signIn(fullPhone, pin);

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    } else {
      router.replace('/(tabs)');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Wallet size={64} color="#2563eb" />
            <Text style={styles.title}>Ability</Text>
            <Text style={styles.subtitle}>Mobile Capital Wallet</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <PhoneInput
                dialCode={countryCode}
                phoneNumber={phoneNumber}
                onDialCodeChange={setCountryCode}
                onPhoneNumberChange={setPhoneNumber}
                disabled={loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>PIN</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter 6-digit PIN"
                placeholderTextColor="#94a3b8"
                value={pin}
                onChangeText={setPin}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={6}
                editable={!loading}
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/auth/signup')}
              disabled={loading}
              style={styles.linkContainer}
            >
              <Text style={styles.link}>
                Don't have a wallet? <Text style={styles.linkBold}>Sign Up</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 8,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginLeft: 4,
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
  button: {
    backgroundColor: '#2563eb',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkContainer: {
    paddingVertical: 12,
  },
  link: {
    color: '#64748b',
    textAlign: 'center',
    fontSize: 14,
  },
  linkBold: {
    color: '#2563eb',
    fontWeight: '600',
  },
  error: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 8,
  },
});

app/auth/signup.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Wallet } from 'lucide-react-native';
import CountryPicker from '@/components/CountryPicker';
import PhoneInput from '@/components/PhoneInput';
import { Country } from '@/lib/countries';

export default function SignUpScreen() {
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [country, setCountry] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { signUp } = useAuth();
  const router = useRouter();

  const handleSignUp = async () => {
    if (!fullName || !nationalId || !country || !phoneNumber || !pin || !confirmPin) {
      setError('Please fill in all required fields');
      return;
    }

    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      setError('PIN must be 6 digits');
      return;
    }

    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }

    setLoading(true);
    setError('');

    const { error: signUpError } = await signUp(
      pin,
      fullName,
      nationalId,
      country,
      countryCode,
      phoneNumber,
      email || undefined
    );

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    router.replace('/(tabs)');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Wallet size={48} color="#2563eb" />
            <Text style={styles.title}>Create Wallet</Text>
            <Text style={styles.subtitle}>Start employing your capital</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name (as on ID or Passport)</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your full name"
                placeholderTextColor="#94a3b8"
                value={fullName}
                onChangeText={setFullName}
                editable={!loading}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>National ID or Passport Number</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter ID or passport number"
                placeholderTextColor="#94a3b8"
                value={nationalId}
                onChangeText={setNationalId}
                editable={!loading}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Country of Residence</Text>
              <CountryPicker
                value={country}
                onChange={(selectedCountry: Country) => setCountry(selectedCountry.name)}
                placeholder="Select your country"
                disabled={loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your email (optional)"
                placeholderTextColor="#94a3b8"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <PhoneInput
                dialCode={countryCode}
                phoneNumber={phoneNumber}
                onDialCodeChange={setCountryCode}
                onPhoneNumberChange={setPhoneNumber}
                disabled={loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>6-digit PIN</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter 6-digit PIN"
                placeholderTextColor="#94a3b8"
                value={pin}
                onChangeText={setPin}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={6}
                editable={!loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm PIN</Text>
              <TextInput
                style={styles.input}
                placeholder="Re-enter your PIN"
                placeholderTextColor="#94a3b8"
                value={confirmPin}
                onChangeText={setConfirmPin}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={6}
                editable={!loading}
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSignUp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Create Wallet</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.back()}
              disabled={loading}
              style={styles.linkContainer}
            >
              <Text style={styles.link}>
                Already have a wallet? <Text style={styles.linkBold}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 15,
    color: '#64748b',
    marginTop: 6,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginLeft: 4,
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
  button: {
    backgroundColor: '#2563eb',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkContainer: {
    paddingVertical: 12,
  },
  link: {
    color: '#64748b',
    textAlign: 'center',
    fontSize: 14,
  },
  linkBold: {
    color: '#2563eb',
    fontWeight: '600',
  },
  error: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 8,
  },
});


WALLET FILES
app/modal/invest.tsx

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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
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

export default function InvestModal() {
  const router = useRouter();
  const { user } = useAuth();
  const [investments, setInvestments] = useState<PendingInvestment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadPendingInvestments = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('pending_investments')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (data) {
        setInvestments(data);
      }
    } catch (error) {
      console.error('Error loading investments:', error);
    }

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadPendingInvestments();
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    loadPendingInvestments();
  };

  const handleAuthorize = async (investment: PendingInvestment) => {
    setProcessingId(investment.id);

    try {
      const { data: wallet } = await supabase
        .from('wallets')
        .select('id, balance_usd')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (!wallet) {
        alert('Wallet not found');
        return;
      }

      if (parseFloat(wallet.balance_usd) < parseFloat(investment.total_amount)) {
        alert('Insufficient balance');
        return;
      }

      const newBalance = (
        parseFloat(wallet.balance_usd) - parseFloat(investment.total_amount)
      ).toString();

      await supabase.from('wallets').update({ balance_usd: newBalance }).eq('id', wallet.id);

      await supabase
        .from('pending_investments')
        .update({ status: 'AUTHORIZED' })
        .eq('id', investment.id);

      await supabase.from('transactions').insert({
        user_id: user?.id,
        transaction_type: 'INVEST',
        amount_usd: investment.total_amount,
        status: 'CONFIRMED',
        company_name: investment.company_name,
      });

      loadPendingInvestments();
    } catch (error) {
      alert('Authorization failed');
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (investment: PendingInvestment) => {
    setProcessingId(investment.id);

    try {
      await supabase
        .from('pending_investments')
        .update({ status: 'CANCELLED' })
        .eq('id', investment.id);

      loadPendingInvestments();
    } catch (error) {
      alert('Cancellation failed');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <Modal animationType="slide" transparent={false} visible={true}>
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <X size={24} color="#1e293b" />
            </TouchableOpacity>
            <Text style={styles.title}>Invest</Text>
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
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <X size={24} color="#1e293b" />
          </TouchableOpacity>
          <Text style={styles.title}>Pending Investments</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
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
              <View key={investment.id} style={styles.investmentCard}>
                <View style={styles.investmentHeader}>
                  <View style={styles.companyInfo}>
                    <View style={styles.companyIcon}>
                      <Building2 size={24} color="#10b981" />
                    </View>
                    <Text style={styles.companyName}>{investment.company_name}</Text>
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
                    onPress={() => handleCancel(investment)}
                    disabled={processingId === investment.id}
                  >
                    {processingId === investment.id ? (
                      <ActivityIndicator size="small" color="#ef4444" />
                    ) : (
                      <>
                        <XCircle size={18} color="#ef4444" />
                        <Text style={styles.cancelButtonText}>Cancel</Text>
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


app/modals/withdraw.tsx

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
import { supabase } from '@/lib/supabase';
import { X, ArrowLeft, Building2, Wallet as WalletIcon, User, Check } from 'lucide-react-native';

type Step = 'method' | 'bank' | 'account' | 'amount' | 'authorize';
type WithdrawMethod = 'bank' | 'mobile_money' | 'agent';

interface Bank {
  id: string;
  name: string;
  code: string;
}

export default function WithdrawModal() {
  const router = useRouter();
  const { user } = useAuth();
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

  useEffect(() => {
    loadUserData();
  }, [user]);

  const loadUserData = async () => {
    if (!user) return;

    const [{ data: profile }, { data: wallet }] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('country')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('wallets')
        .select('balance_usd')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    if (profile) setUserCountry(profile.country);
    if (wallet) setBalance(wallet.balance_usd);
  };

  const loadBanks = async () => {
    if (!userCountry) return;

    setLoading(true);
    try {
      const { data } = await supabase
        .from('banks')
        .select('*')
        .eq('country', userCountry)
        .order('name');

      if (data) {
        setBanks(data);
      }
    } catch (error) {
      console.error('Error loading banks:', error);
    } finally {
      setLoading(false);
    }
  };

  const verifyAccount = async () => {
    setLoading(true);
    setError('');

    try {
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

      const { data: wallet } = await supabase
        .from('wallets')
        .select('id')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (!wallet) {
        setError('Wallet not found');
        return;
      }

      const newBalance = (balanceNum - amountNum).toString();
      await supabase.from('wallets').update({ balance_usd: newBalance }).eq('id', wallet.id);

      await supabase.from('transactions').insert({
        user_id: user?.id,
        transaction_type: 'WITHDRAW',
        amount_usd: amount,
        status: 'PENDING',
        description: `Withdrawal to ${selectedBank?.name} - ${accountNumber}`,
      });

      router.back();
    } catch (err) {
      setError('Withdrawal failed');
    } finally {
      setLoading(false);
    }
  };

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
              <Text style={styles.stepTitle}>Select Withdrawal Method</Text>

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
              <Text style={styles.stepTitle}>Select Your Bank</Text>

              {loading ? (
                <ActivityIndicator size="large" color="#2563eb" />
              ) : banks.length === 0 ? (
                <Text style={styles.emptyText}>No banks available for your country</Text>
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
              <Text style={styles.stepTitle}>Enter Account Details</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  {method === 'bank' ? 'Account Number' : method === 'mobile_money' ? 'Mobile Number' : 'Agent ID'}
                </Text>
                <TextInput
                  style={styles.input}
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  placeholder={
                    method === 'bank'
                      ? '1234567890'
                      : method === 'mobile_money'
                      ? '+1234567890'
                      : 'AG-12345'
                  }
                  keyboardType={method === 'agent' ? 'default' : 'numeric'}
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
                disabled={loading || !accountNumber}
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
              <Text style={styles.stepTitle}>Enter Capital Amount</Text>

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

              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep('account')}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => setStep('authorize')}
                  disabled={!amount || parseFloat(amount) <= 0}
                >
                  <Text style={styles.primaryButtonText}>Continue</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {step === 'authorize' && (
            <View>
              <Text style={styles.stepTitle}>Authorize Withdrawal</Text>

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
    color: '#1e293b',
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
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
    color: '#1e293b',
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
    borderColor: '#e2e8f0',
  },
  bankCardSelected: {
    borderColor: '#2563eb',
    borderWidth: 2,
    backgroundColor: '#eff6ff',
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
    color: '#1e293b',
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
    borderColor: '#e2e8f0',
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
    borderColor: '#e2e8f0',
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
    backgroundColor: '#2563eb',
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
  secondaryButton: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
    borderColor: '#e2e8f0',
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
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 32,
  },
});


app/modals/xchange.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { X, Phone, User, MapPin, Check, ArrowLeft, Users } from 'lucide-react-native';
import PhoneInput from '@/components/PhoneInput';
import * as Contacts from 'expo-contacts';

type Step = 'phone' | 'verify' | 'amount' | 'authorize';

interface RecipientData {
  id: string;
  full_name: string;
  country: string;
  phone: string;
}

export default function XchangeModal() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState<RecipientData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [senderData, setSenderData] = useState<RecipientData | null>(null);

  const loadSenderData = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('user_profiles')
      .select('id, full_name, country, phone')
      .eq('id', user.id)
      .maybeSingle();

    if (data) {
      setSenderData(data);
    }
  };

  React.useEffect(() => {
    loadSenderData();
  }, [user]);

  const requestContactsPermission = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'Contact access is not available on web.');
      return;
    }

    const { status } = await Contacts.requestPermissionsAsync();
    if (status === 'granted') {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });

      if (data.length > 0) {
        Alert.alert(
          'Contacts Access',
          `Found ${data.length} contacts. You can now select a contact to Xchange capital.`,
          [{ text: 'OK' }]
        );
      }
    } else {
      Alert.alert(
        'Permission Required',
        'Please enable contacts access in your device settings to use this feature.',
        [{ text: 'OK' }]
      );
    }
  };

  const searchRecipient = async () => {
    setLoading(true);
    setError('');

    try {
      const fullPhone = `${countryCode}${phoneNumber}`;
      const { data } = await supabase
        .from('user_profiles')
        .select('id, full_name, country, phone')
        .eq('phone', fullPhone)
        .maybeSingle();

      if (data) {
        setRecipient(data);
        setStep('verify');
      } else {
        setError('No user found with this phone number');
      }
    } catch (err) {
      setError('Error searching for recipient');
    } finally {
      setLoading(false);
    }
  };

  const handleAuthorize = async () => {
    setLoading(true);
    setError('');

    try {
      const { data: wallet } = await supabase
        .from('wallets')
        .select('id, balance_usd')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (!wallet) {
        setError('Wallet not found');
        return;
      }

      if (parseFloat(wallet.balance_usd) < parseFloat(amount)) {
        setError('Insufficient balance');
        return;
      }

      const { data: recipientWallet } = await supabase
        .from('wallets')
        .select('id')
        .eq('user_id', recipient?.id)
        .maybeSingle();

      if (!recipientWallet) {
        setError('Recipient wallet not found');
        return;
      }

      const newSenderBalance = (parseFloat(wallet.balance_usd) - parseFloat(amount)).toString();
      const { data: recipientWalletData } = await supabase
        .from('wallets')
        .select('balance_usd')
        .eq('id', recipientWallet.id)
        .maybeSingle();

      const newRecipientBalance = (
        parseFloat(recipientWalletData?.balance_usd || '0') + parseFloat(amount)
      ).toString();

      await supabase.from('wallets').update({ balance_usd: newSenderBalance }).eq('id', wallet.id);

      await supabase
        .from('wallets')
        .update({ balance_usd: newRecipientBalance })
        .eq('id', recipientWallet.id);

      await supabase.from('transactions').insert({
        user_id: user?.id,
        transaction_type: 'XCHANGE',
        amount_usd: amount,
        status: 'CONFIRMED',
        recipient_name: recipient?.full_name,
      });

      router.back();
    } catch (err) {
      setError('Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal animationType="slide" transparent={false} visible={true}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => (step === 'phone' ? router.back() : setStep('phone'))}
            style={styles.backButton}
          >
            {step === 'phone' ? <X size={24} color="#1e293b" /> : <ArrowLeft size={24} color="#1e293b" />}
          </TouchableOpacity>
          <Text style={styles.title}>Xchange Capital</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content}>
          {step === 'phone' && (
            <View>
              <Text style={styles.stepTitle}>Enter Recipient Phone Number</Text>

              <View style={styles.inputGroup}>
                <PhoneInput
                  dialCode={countryCode}
                  phoneNumber={phoneNumber}
                  onDialCodeChange={setCountryCode}
                  onPhoneNumberChange={setPhoneNumber}
                  disabled={loading}
                />
              </View>

              <TouchableOpacity
                style={styles.contactsButton}
                onPress={requestContactsPermission}
              >
                <Users size={20} color="#2563eb" />
                <Text style={styles.contactsButtonText}>
                  Select from Contacts
                </Text>
              </TouchableOpacity>

              {error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : null}

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={searchRecipient}
                disabled={loading || !phoneNumber}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Continue</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {step === 'verify' && recipient && (
            <View>
              <Text style={styles.stepTitle}>Verify Recipient</Text>

              <View style={styles.verifyCard}>
                <View style={styles.verifyRow}>
                  <User size={20} color="#64748b" />
                  <View style={styles.verifyContent}>
                    <Text style={styles.verifyLabel}>Full Name</Text>
                    <Text style={styles.verifyValue}>{recipient.full_name}</Text>
                  </View>
                </View>

                <View style={styles.verifyRow}>
                  <MapPin size={20} color="#64748b" />
                  <View style={styles.verifyContent}>
                    <Text style={styles.verifyLabel}>Country</Text>
                    <Text style={styles.verifyValue}>{recipient.country}</Text>
                  </View>
                </View>

                <View style={styles.verifyRow}>
                  <Phone size={20} color="#64748b" />
                  <View style={styles.verifyContent}>
                    <Text style={styles.verifyLabel}>Phone</Text>
                    <Text style={styles.verifyValue}>{recipient.phone}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setStep('phone')}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => setStep('amount')}
                >
                  <Text style={styles.primaryButtonText}>Proceed</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {step === 'amount' && (
            <View>
              <Text style={styles.stepTitle}>Enter Capital Amount</Text>

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

              {error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : null}

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setStep('verify')}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => setStep('authorize')}
                  disabled={!amount || parseFloat(amount) <= 0}
                >
                  <Text style={styles.primaryButtonText}>Xchange</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {step === 'authorize' && recipient && senderData && (
            <View>
              <Text style={styles.stepTitle}>Authorize Transaction</Text>

              <View style={styles.summaryCard}>
                <Text style={styles.summarySection}>Sender</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Full Name</Text>
                  <Text style={styles.summaryValue}>{senderData.full_name}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Country</Text>
                  <Text style={styles.summaryValue}>{senderData.country}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Phone</Text>
                  <Text style={styles.summaryValue}>{senderData.phone}</Text>
                </View>

                <View style={styles.divider} />

                <Text style={styles.summarySection}>Recipient</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Full Name</Text>
                  <Text style={styles.summaryValue}>{recipient.full_name}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Country</Text>
                  <Text style={styles.summaryValue}>{recipient.country}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Phone</Text>
                  <Text style={styles.summaryValue}>{recipient.phone}</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.amountSummary}>
                  <Text style={styles.amountSummaryLabel}>Capital Amount</Text>
                  <Text style={styles.amountSummaryValue}>${parseFloat(amount).toFixed(2)}</Text>
                </View>
              </View>

              {error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : null}

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
    color: '#1e293b',
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
  inputGroup: {
    marginBottom: 16,
  },
  contactsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 8,
    marginBottom: 16,
  },
  contactsButtonText: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '600',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
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
  secondaryButton: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
  verifyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  verifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  verifyContent: {
    flex: 1,
  },
  verifyLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 2,
  },
  verifyValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  summarySection: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
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
    marginVertical: 16,
  },
  amountSummary: {
    backgroundColor: '#eff6ff',
    padding: 16,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountSummaryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
  },
  amountSummaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2563eb',
  },
  authorizeButton: {
    backgroundColor: '#10b981',
  },
});

TRANSACTION FILES
app/(tabs)/index.tsx

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Eye, EyeOff, ArrowLeftRight, TrendingUp, ArrowDownToLine } from 'lucide-react-native';

export default function WalletHomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [balance, setBalance] = useState<string>('0.00');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [fullName, setFullName] = useState('');

  const loadData = async () => {
    if (!user) return;

    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        setFullName(profile.full_name);
      }

      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance_usd')
        .eq('user_id', user.id)
        .maybeSingle();

      if (wallet) {
        setBalance(wallet.balance_usd);
      }
    } catch (error) {
      console.error('Error loading wallet data:', error);
    }

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>Hi,</Text>
          <Text style={styles.name}>{fullName || user?.email}</Text>
        </View>

        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <Text style={styles.balanceLabel}>USD Wallet Balance</Text>
            <TouchableOpacity onPress={() => setBalanceVisible(!balanceVisible)}>
              {balanceVisible ? (
                <Eye size={20} color="#93c5fd" />
              ) : (
                <EyeOff size={20} color="#93c5fd" />
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.balanceAmount}>
            {balanceVisible
              ? `$${parseFloat(balance).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : '••••••'}
          </Text>
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/modals/xchange')}
          >
            <View style={[styles.actionIconContainer, { backgroundColor: '#eff6ff' }]}>
              <ArrowLeftRight size={24} color="#2563eb" />
            </View>
            <Text style={styles.actionLabel}>Xchange</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/modals/invest')}
          >
            <View style={[styles.actionIconContainer, { backgroundColor: '#f0fdf4' }]}>
              <TrendingUp size={24} color="#10b981" />
            </View>
            <Text style={styles.actionLabel}>Invest</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/modals/withdraw')}
          >
            <View style={[styles.actionIconContainer, { backgroundColor: '#fef3c7' }]}>
              <ArrowDownToLine size={24} color="#f59e0b" />
            </View>
            <Text style={styles.actionLabel}>Withdraw</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Injecting Capital</Text>
          <Text style={styles.infoText}>
            Capital injections are processed externally via your banking app, mobile money wallet, or agent. Capital will appear in your wallet automatically.
          </Text>
        </View>
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
  header: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#fff',
  },
  greeting: {
    fontSize: 16,
    color: '#64748b',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 4,
  },
  balanceCard: {
    backgroundColor: '#2563eb',
    margin: 24,
    padding: 24,
    borderRadius: 20,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#93c5fd',
    fontWeight: '500',
  },
  balanceAmount: {
    fontSize: 40,
    fontWeight: '700',
    color: '#fff',
    marginTop: 8,
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
    borderColor: '#e2e8f0',
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
    color: '#1e293b',
  },
  infoBox: {
    backgroundColor: '#eff6ff',
    marginHorizontal: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
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

app/(tabs)/history.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
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
  recipient_name?: string;
  company_name?: string;
}

export default function HistoryScreen() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (data) {
        setTransactions(data);
      }
    } catch (error) {
      console.error('Error loading history:', error);
    }

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadHistory();
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    loadHistory();
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'XCHANGE':
        return <ArrowLeftRight size={20} color="#2563eb" />;
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Capital Transaction History</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {transactions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No capital transactions yet</Text>
            <Text style={styles.emptySubtext}>
              Your capital transaction history will appear here
            </Text>
          </View>
        ) : (
          transactions.map((tx) => (
            <TouchableOpacity key={tx.id} style={styles.transactionCard}>
              <View style={[styles.transactionIcon, { backgroundColor: getIconBg(tx.transaction_type) }]}>
                {getIcon(tx.transaction_type)}
              </View>

              <View style={styles.transactionContent}>
                <View style={styles.transactionHeader}>
                  <Text style={styles.transactionTitle}>{getDisplayName(tx)}</Text>
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
                    ${parseFloat(tx.amount_usd).toFixed(2)}
                  </Text>
                </View>

                <Text style={styles.transactionDate}>{formatDate(tx.created_at)}</Text>

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
});

contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { hashPin, validatePin, generateSecurePassword, formatPhoneNumber } from '@/lib/auth';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (phone: string, pin: string) => Promise<{ error: any }>;
  signUp: (
    pin: string,
    fullName: string,
    nationalId: string,
    country: string,
    countryCode: string,
    phoneNumber: string,
    email?: string
  ) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (phone: string, pin: string) => {
    try {
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, email, hashed_pin')
        .eq('phone', phone)
        .maybeSingle();

      if (profileError || !profile) {
        return { error: { message: 'Invalid phone number or PIN' } };
      }

      if (!profile.hashed_pin) {
        return { error: { message: 'Wallet setup incomplete. Please contact support.' } };
      }

      const isPinValid = await validatePin(pin, profile.hashed_pin);

      if (!isPinValid) {
        return { error: { message: 'Invalid phone number or PIN' } };
      }

      const { data: authUserData, error: authError } = await supabase.rpc('get_user_auth_email', {
        user_uuid: profile.id,
      });

      const emailToUse = authError || !authUserData ? profile.email : authUserData;

      if (!emailToUse) {
        return { error: { message: 'Wallet setup incomplete. Please contact support.' } };
      }

      const securePassword = `${profile.id}_${emailToUse}`;

      const { error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password: securePassword,
      });

      return { error };
    } catch (err: any) {
      return { error: { message: err.message || 'Login failed' } };
    }
  };

  const signUp = async (
    pin: string,
    fullName: string,
    nationalId: string,
    country: string,
    countryCode: string,
    phoneNumber: string,
    email?: string
  ) => {
    try {
      const fullPhone = formatPhoneNumber(countryCode, phoneNumber);

      const { data: existingPhone } = await supabase
        .from('user_profiles')
        .select('phone')
        .eq('phone', fullPhone)
        .maybeSingle();

      if (existingPhone) {
        return { error: { message: 'Phone number already registered' } };
      }

      const { data: existingNationalId } = await supabase
        .from('user_profiles')
        .select('national_id')
        .eq('national_id', nationalId)
        .maybeSingle();

      if (existingNationalId) {
        return { error: { message: 'National ID already registered' } };
      }

      const generatedEmail = email || `${fullPhone.replace(/\+/g, '')}@wallet.local`;

      const securePassword = await generateSecurePassword();
      const hashedPinValue = await hashPin(pin);

      const { data, error } = await supabase.auth.signUp({
        email: generatedEmail,
        password: securePassword,
      });

      if (error) {
        return { error };
      }

      if (!data.user) {
        return { error: { message: 'Failed to create wallet' } };
      }

      const passwordForAuth = `${data.user.id}_${generatedEmail}`;

      await supabase.auth.signInWithPassword({
        email: generatedEmail,
        password: securePassword,
      });

      await supabase.auth.updateUser({
        password: passwordForAuth,
      });

      const { error: profileError } = await supabase.from('user_profiles').insert({
        id: data.user.id,
        full_name: fullName,
        national_id: nationalId,
        country,
        phone: fullPhone,
        email: email || null,
        hashed_pin: hashedPinValue,
      });

      if (profileError) {
        return { error: profileError };
      }

      const { error: walletError } = await supabase.from('wallets').insert({
        user_id: data.user.id,
        balance_usd: '0.00',
        wallet_type: 'INDIVIDUAL',
        status: 'ACTIVE',
      });

      if (walletError) {
        return { error: walletError };
      }

      const { error: settingsError } = await supabase.from('user_settings').insert({
        user_id: data.user.id,
      });

      if (settingsError) {
        return { error: settingsError };
      }

      return { error: null };
    } catch (err: any) {
      return { error: { message: err.message || 'Signup failed' } };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = {
    session,
    user,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
