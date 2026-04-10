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
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatPhoneNumber, getPhoneLookupCandidates } from '@/lib/auth';
import { X, Phone, User, MapPin, Check, ArrowLeft, Users } from 'lucide-react-native';
import PhoneInput from '@/components/PhoneInput';
import * as Contacts from 'expo-contacts';
import { countries } from '@/lib/countries';

type Step = 'phone' | 'verify' | 'amount' | 'authorize';

interface RecipientData {
  id: string;
  full_name: string;
  country: string | null;
  phone: string;
}

interface ContactItem {
  id: string;
  name: string;
  phone: string;
}

export default function XchangeModal() {
  const router = useRouter();
  const { user, getToken } = useAuth();
  const [step, setStep] = useState<Step>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState<RecipientData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [senderData, setSenderData] = useState<RecipientData | null>(null);
  const [transactionPin, setTransactionPin] = useState('');
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsModalVisible, setContactsModalVisible] = useState(false);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [contactsSearch, setContactsSearch] = useState('');

  const applyContactPhone = (rawPhone: string) => {
    let p = String(rawPhone || '').trim().replace(/[^\d+]/g, '');
    if (!p) return;
    if (p.startsWith('00')) p = `+${p.slice(2)}`;

    if (p.startsWith('+')) {
      const sorted = [...countries].sort((a, b) => b.dialCode.length - a.dialCode.length);
      const matched = sorted.find((c) => p.startsWith(c.dialCode));
      if (matched) {
        const local = p.slice(matched.dialCode.length).replace(/\D/g, '');
        setCountryCode(matched.dialCode);
        setPhoneNumber(local);
        return;
      }
    }
    setPhoneNumber(p.replace(/\D/g, ''));
  };

  const loadSenderData = async () => {
    if (!user) return;

    const token = await getToken();
    if (!token) return;

    const response = await apiFetch('/api/me', token);
    if (!response.ok) return;

    const data = await response.json();
    if (data.profile) {
      setSenderData({
        id: data.profile.id,
        full_name: data.profile.full_name,
        country: data.profile.country,
        phone: data.profile.phone,
      });
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

    setContactsLoading(true);
    const { status } = await Contacts.requestPermissionsAsync();
    if (status === 'granted') {
      try {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        });
        const normalized: ContactItem[] = (data || [])
          .map((c) => {
            const first = c.phoneNumbers?.[0]?.number?.trim() || '';
            return {
              id: c.id,
              name: c.name?.trim() || 'Unknown',
              phone: first,
            };
          })
          .filter((c) => c.phone.length > 0);

        if (normalized.length === 0) {
          Alert.alert('No Contacts', 'No contacts with phone numbers were found on this device.');
          return;
        }
        setContacts(normalized);
        setContactsSearch('');
        setContactsModalVisible(true);
      } finally {
        setContactsLoading(false);
      }
    } else {
      setContactsLoading(false);
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
      const token = await getToken();
      if (!token) return;
      const candidates = getPhoneLookupCandidates(countryCode, phoneNumber);
      let found = false;

      for (const candidate of candidates) {
        const response = await apiFetch(
          `/api/profile/lookup?phone=${encodeURIComponent(candidate)}`,
          token
        );
        if (response.status === 403) {
          const err = await response.json().catch(() => ({}));
          setError(err.error || 'Complete KYC in Settings to send money.');
          return;
        }
        if (!response.ok) {
          continue;
        }
        const payload = await response.json();
        if (payload.profile) {
          setRecipient(payload.profile);
          setStep('verify');
          found = true;
          break;
        }
      }

      if (!found) {
        setError('No user found with this phone number.');
      }
    } catch (err) {
      setError('Error searching for recipient');
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
      const token = await getToken();
      if (!token) {
        setError('Not signed in');
        return;
      }

      const fullPhone = recipient?.phone || formatPhoneNumber(countryCode, phoneNumber);
      const response = await apiFetch('/api/wallet/xchange', token, {
        method: 'POST',
        body: JSON.stringify({
          recipientPhone: fullPhone,
          amountUsd: parseFloat(amount),
          pin: transactionPin.trim(),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const message = err.error || 'Transaction failed';
        setError(message);
        Alert.alert('Transaction failed', message);
        return;
      }

      Alert.alert('Success', 'Capital transfer authorized successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      setError('Transaction failed');
      Alert.alert('Transaction failed', 'Something went wrong while authorizing this transfer.');
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
                disabled={contactsLoading}
              >
                {contactsLoading ? (
                  <ActivityIndicator size="small" color="#2563eb" />
                ) : (
                  <>
                    <Users size={20} color="#2563eb" />
                    <Text style={styles.contactsButtonText}>
                      Select from Contacts
                    </Text>
                  </>
                )}
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
                    <Text style={styles.verifyValue}>{recipient.country ?? '—'}</Text>
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
                  <Text style={styles.summaryValue}>{senderData.country ?? '—'}</Text>
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
                  <Text style={styles.summaryValue}>{recipient.country ?? '—'}</Text>
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

      <Modal visible={contactsModalVisible} animationType="slide" transparent={true}>
        <View style={styles.contactModalOverlay}>
          <View style={styles.contactModalCard}>
            <View style={styles.contactModalHeader}>
              <Text style={styles.contactModalTitle}>Select Contact</Text>
              <TouchableOpacity onPress={() => setContactsModalVisible(false)}>
                <X size={22} color="#1e293b" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.contactSearchInput}
              placeholder="Search contacts"
              placeholderTextColor="#94a3b8"
              value={contactsSearch}
              onChangeText={setContactsSearch}
            />
            <FlatList
              data={contacts.filter((c) => {
                const q = contactsSearch.trim().toLowerCase();
                if (!q) return true;
                return (
                  c.name.toLowerCase().includes(q) ||
                  c.phone.toLowerCase().includes(q)
                );
              })}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.contactRow}
                  onPress={() => {
                    applyContactPhone(item.phone);
                    setContactsModalVisible(false);
                  }}
                >
                  <View style={styles.contactAvatar}>
                    <User size={16} color="#2563eb" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.contactName}>{item.name}</Text>
                    <Text style={styles.contactPhone}>{item.phone}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
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
    fontSize: 22,
    fontWeight: '700',
    color: '#6366f1',
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
  contactModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  contactModalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '78%',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  contactModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  contactModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  contactSearchInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#1e293b',
    marginBottom: 10,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  contactAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactName: {
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '600',
  },
  contactPhone: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 1,
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
  pinLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  pinInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    letterSpacing: 4,
    color: '#1e293b',
    marginBottom: 8,
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
