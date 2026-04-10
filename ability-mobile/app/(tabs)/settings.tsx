import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  TextInput,
  ActivityIndicator,
  Keyboard,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiFetch, describeFetchError, getApiBaseUrl } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import CountryPicker from '@/components/CountryPicker';
import { Country } from '@/lib/countries';
import {
  User,
  Bell,
  Lock,
  ChevronRight,
  LogOut,
  Circle as HelpCircle,
  FileText,
  MapPin,
  IdCard,
} from 'lucide-react-native';

type UserSettings = {
  currency: string;
  notifications_enabled: boolean;
  theme: string;
};

type UserProfile = {
  biometric_enabled: boolean;
  full_name?: string;
  phone?: string;
  country?: string | null;
  national_id?: string | null;
  kyc_complete?: boolean;
  pin_set?: boolean;
};

export default function SettingsScreen() {
  const { user, signOut, getToken } = useAuth();
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [identityCountry, setIdentityCountry] = useState('');
  const [identityNationalId, setIdentityNationalId] = useState('');
  const [identityPin, setIdentityPin] = useState('');
  const [identityConfirmPin, setIdentityConfirmPin] = useState('');
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [changePinVisible, setChangePinVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const [showKycEditor, setShowKycEditor] = useState(false);
  const [isProfileEditMode, setIsProfileEditMode] = useState(false);
  const [profileEditPin, setProfileEditPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [changingPin, setChangingPin] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Missing auth token');
      }

      const response = await apiFetch('/api/me', token);
      if (!response.ok) {
        throw new Error('Failed to load settings');
      }

      const data = await response.json();
      if (data.settings) {
        // Theme selector is removed; enforce light theme.
        setSettings({ ...data.settings, theme: 'light' });
        await setTheme('light');
      }
      if (data.profile) {
        const p = {
          ...data.profile,
          kyc_complete: Boolean(data.kyc_complete ?? data.profile.kyc_complete),
        };
        setProfile(p);
        setIdentityCountry(p.country ?? '');
        setIdentityNationalId(p.national_id ?? '');
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key: keyof UserSettings, value: any) => {
    if (!user || !settings) return;
    try {
      const token = await getToken();
      if (!token) return;

      const response = await apiFetch('/api/me/settings', token, {
        method: 'PATCH',
        body: JSON.stringify({
          notificationsEnabled:
            key === 'notifications_enabled' ? Boolean(value) : undefined,
          theme: key === 'theme' ? String(value) : undefined,
        }),
      });

      if (response.ok) {
        setSettings({ ...settings, [key]: value });
      }
    } catch (error) {
      console.error('Error updating setting:', error);
    }
  };

  const saveIdentity = async () => {
    Keyboard.dismiss();
    const country = identityCountry.trim();
    const nationalId = identityNationalId.trim();
    const pin = identityPin.trim();
    const confirmPin = identityConfirmPin.trim();

    if (!country || !nationalId) {
      Alert.alert('Required', 'Please select your country and enter your national ID or passport number.');
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      Alert.alert('PIN', 'Transaction PIN must be exactly 6 digits.');
      return;
    }
    if (pin !== confirmPin) {
      Alert.alert('PIN', 'PIN confirmation does not match.');
      return;
    }

    if (!user) {
      Alert.alert('Session', 'You are not signed in. Please log in again.');
      return;
    }
    setSavingIdentity(true);
    try {
      const token = await getToken();
      if (!token) {
        Alert.alert('Session expired', 'Please sign out and log in again, then save KYC.');
        return;
      }

      const response = await apiFetch('/api/me/kyc', token, {
        method: 'PATCH',
        body: JSON.stringify({ country, nationalId, pin, confirmPin }),
      });

      const raw = await response.text();
      let payload: { error?: string } = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = { error: raw?.slice(0, 200) || 'Invalid response' };
      }
      if (!response.ok) {
        Alert.alert(
          'Could not save',
          typeof payload.error === 'string' ? payload.error : 'Please try again.'
        );
        return;
      }

      setIdentityPin('');
      setIdentityConfirmPin('');
      setShowKycEditor(false);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              country,
              national_id: nationalId,
              kyc_complete: true,
              pin_set: true,
            }
          : {
              biometric_enabled: false,
              country,
              national_id: nationalId,
              kyc_complete: true,
              pin_set: true,
            }
      );
      Alert.alert('Saved', 'Your KYC details and transaction PIN were saved.', [
        {
          text: 'Continue',
          onPress: () => router.replace('/(tabs)'),
        },
      ]);
    } catch (e) {
      console.error('saveIdentity', e);
      let base = '';
      try {
        base = getApiBaseUrl();
      } catch {
        base = '(set EXPO_PUBLIC_API_URL)';
      }
      Alert.alert('Error', describeFetchError(base, e));
    } finally {
      setSavingIdentity(false);
    }
  };

  const saveProfileIdentity = async () => {
    Keyboard.dismiss();
    const country = identityCountry.trim();
    const nationalId = identityNationalId.trim();
    const pin = profileEditPin.trim();

    if (!country || !nationalId) {
      Alert.alert('Required', 'Please select your country and enter your national ID or passport number.');
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      Alert.alert('PIN required', 'Enter your current 6-digit transaction PIN.');
      return;
    }

    setSavingIdentity(true);
    try {
      const token = await getToken();
      if (!token) {
        Alert.alert('Session expired', 'Please sign in again.');
        return;
      }
      const response = await apiFetch('/api/me/profile', token, {
        method: 'PATCH',
        body: JSON.stringify({ country, nationalId, pin }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        Alert.alert('Could not save', payload.error || 'Please try again.');
        return;
      }

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              country,
              national_id: nationalId,
            }
          : prev
      );
      setProfileEditPin('');
      setShowKycEditor(false);
      setIsProfileEditMode(false);
      Alert.alert('Saved', 'Profile details updated successfully.');
    } catch (error) {
      console.error('save profile identity', error);
      Alert.alert('Error', 'Unable to save profile details right now. Please try again.');
    } finally {
      setSavingIdentity(false);
    }
  };

  const resetChangePinForm = () => {
    setCurrentPin('');
    setNewPin('');
    setConfirmNewPin('');
    setChangingPin(false);
  };

  const openChangePin = () => {
    resetChangePinForm();
    setChangePinVisible(true);
  };

  const isVerified = Boolean(profile?.kyc_complete);
  const initialCountry = profile?.country ?? '';
  const initialNationalId = profile?.national_id ?? '';
  const noProfileEditChanges = useMemo(
    () =>
      identityCountry.trim() === String(initialCountry).trim() &&
      identityNationalId.trim() === String(initialNationalId).trim() &&
      profileEditPin.trim() === '',
    [identityCountry, identityNationalId, initialCountry, initialNationalId, profileEditPin]
  );

  useEffect(() => {
    if (!showKycEditor || !isProfileEditMode || !isVerified) return;
    if (!noProfileEditChanges) return;

    const timer = setTimeout(() => {
      setShowKycEditor(false);
      setIsProfileEditMode(false);
    }, 15000);
    return () => clearTimeout(timer);
  }, [showKycEditor, isProfileEditMode, isVerified, noProfileEditChanges]);

  const submitChangePin = async () => {
    Keyboard.dismiss();
    const cur = currentPin.trim();
    const next = newPin.trim();
    const confirm = confirmNewPin.trim();

    if (!/^\d{6}$/.test(cur)) {
      Alert.alert('Current PIN', 'Enter your current 6-digit PIN.');
      return;
    }
    if (!/^\d{6}$/.test(next)) {
      Alert.alert('New PIN', 'Enter a new 6-digit PIN.');
      return;
    }
    if (next !== confirm) {
      Alert.alert('New PIN', 'New PIN confirmation does not match.');
      return;
    }
    if (cur === next) {
      Alert.alert('New PIN', 'New PIN must be different from current PIN.');
      return;
    }

    setChangingPin(true);
    try {
      const token = await getToken();
      if (!token) {
        Alert.alert('Session expired', 'Please sign in again.');
        return;
      }
      const response = await apiFetch('/api/me/pin', token, {
        method: 'PATCH',
        body: JSON.stringify({
          currentPin: cur,
          newPin: next,
          confirmPin: confirm,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        Alert.alert('Could not change PIN', payload.error || 'Please try again.');
        return;
      }
      setChangePinVisible(false);
      resetChangePinForm();
      Alert.alert('Success', 'Your transaction PIN has been changed.');
    } catch (error) {
      console.error('change pin', error);
      Alert.alert('Error', 'Unable to change PIN right now. Please try again.');
    } finally {
      setChangingPin(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/auth/login');
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: isDark ? '#020617' : '#f8fafc' }]}>
        <Text>Loading settings...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#020617' : '#f8fafc' }]}>
      <View style={[styles.header, { backgroundColor: isDark ? '#0f172a' : '#fff', borderBottomColor: isDark ? '#1e293b' : '#e2e8f0' }]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Settings</Text>
          {isVerified ? (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedBadgeText}>Verified</Text>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wallet</Text>

          <View style={styles.card}>
            <TouchableOpacity style={styles.menuItem} onPress={() => setProfileVisible(true)}>
              <View style={styles.menuItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: '#eff6ff' }]}>
                  <User size={20} color="#2563eb" />
                </View>
                <View>
                  <Text style={styles.menuItemTitle}>Profile</Text>
                  <Text style={styles.menuItemSubtitle}>
                    {profile?.full_name || 'User'}
                  </Text>
                </View>
              </View>
              <ChevronRight size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </View>

        {(!isVerified || showKycEditor) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{'KYC & transaction PIN'}</Text>
            {!isProfileEditMode ? (
              <Text style={styles.sectionHint}>
                Required by regulation: country, government ID, and a 6-digit PIN used only to authorize
                transfers and withdrawals (not your login password). Wallet features stay locked until this is
                complete.
              </Text>
            ) : (
              <Text style={styles.sectionHint}>
                Update your country/ID details. Confirm with your current transaction PIN to save changes.
              </Text>
            )}

            <View style={styles.card}>
              <View style={styles.formBlock}>
                <Text style={styles.fieldLabel}>Country</Text>
                <CountryPicker
                  value={identityCountry}
                  onChange={(c: Country) => setIdentityCountry(c.name)}
                  placeholder="Select your country"
                  disabled={savingIdentity}
                />
              </View>

              <View style={styles.formBlock}>
                <View style={styles.fieldLabelRow}>
                  <IdCard size={16} color="#64748b" />
                  <Text style={styles.fieldLabel}>National ID or passport number</Text>
                </View>
                <TextInput
                  style={styles.textField}
                  placeholder="Enter ID or passport number"
                  placeholderTextColor="#94a3b8"
                  value={identityNationalId}
                  onChangeText={setIdentityNationalId}
                  autoCapitalize="characters"
                  editable={!savingIdentity}
                />
              </View>

              {!isProfileEditMode ? (
                <>
                  <View style={styles.formBlock}>
                    <View style={styles.fieldLabelRow}>
                      <Lock size={16} color="#64748b" />
                      <Text style={styles.fieldLabel}>6-digit transaction PIN</Text>
                    </View>
                    <TextInput
                      style={styles.textField}
                      placeholder="6 digits"
                      placeholderTextColor="#94a3b8"
                      value={identityPin}
                      onChangeText={setIdentityPin}
                      secureTextEntry
                      keyboardType="number-pad"
                      maxLength={6}
                      editable={!savingIdentity}
                    />
                  </View>

                  <View style={styles.formBlock}>
                    <Text style={styles.fieldLabel}>Confirm transaction PIN</Text>
                    <TextInput
                      style={styles.textField}
                      placeholder="Re-enter 6-digit PIN"
                      placeholderTextColor="#94a3b8"
                      value={identityConfirmPin}
                      onChangeText={setIdentityConfirmPin}
                      secureTextEntry
                      keyboardType="number-pad"
                      maxLength={6}
                      editable={!savingIdentity}
                    />
                  </View>
                </>
              ) : (
                <View style={styles.formBlock}>
                  <View style={styles.fieldLabelRow}>
                    <Lock size={16} color="#64748b" />
                    <Text style={styles.fieldLabel}>Current transaction PIN</Text>
                  </View>
                  <TextInput
                    style={styles.textField}
                    placeholder="Enter current 6-digit PIN"
                    placeholderTextColor="#94a3b8"
                    value={profileEditPin}
                    onChangeText={setProfileEditPin}
                    secureTextEntry
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!savingIdentity}
                  />
                </View>
              )}

              <TouchableOpacity
                style={[styles.saveIdentityButton, savingIdentity && styles.saveIdentityButtonDisabled]}
                onPress={isProfileEditMode ? saveProfileIdentity : saveIdentity}
                disabled={savingIdentity}
              >
                {savingIdentity ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveIdentityButtonText}>
                    {isProfileEditMode ? 'Save Profile Changes' : 'Save KYC & PIN'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>

          <View style={styles.card}>
            <View style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: '#fef3c7' }]}>
                  <Bell size={20} color="#f59e0b" />
                </View>
                <Text style={styles.menuItemTitle}>Notifications</Text>
              </View>
              <Switch
                value={settings?.notifications_enabled ?? true}
                onValueChange={(value) =>
                  updateSetting('notifications_enabled', value)
                }
                trackColor={{ false: '#e2e8f0', true: '#93c5fd' }}
                thumbColor={settings?.notifications_enabled ? '#2563eb' : '#f8fafc'}
              />
            </View>

            <View style={styles.divider} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>

          <View style={styles.card}>
            <TouchableOpacity style={styles.menuItem} onPress={openChangePin}>
              <View style={styles.menuItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: '#dbeafe' }]}>
                  <Lock size={20} color="#2563eb" />
                </View>
                <Text style={styles.menuItemTitle}>Change PIN</Text>
              </View>
              <ChevronRight size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>

          <View style={styles.card}>
            <TouchableOpacity style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: '#f0fdf4' }]}>
                  <HelpCircle size={20} color="#10b981" />
                </View>
                <Text style={styles.menuItemTitle}>Help Center</Text>
              </View>
              <ChevronRight size={20} color="#94a3b8" />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: '#f1f5f9' }]}>
                  <FileText size={20} color="#64748b" />
                </View>
                <Text style={styles.menuItemTitle}>Terms & Privacy</Text>
              </View>
              <ChevronRight size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
          <LogOut size={20} color="#ef4444" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Version 1.0.0</Text>
      </ScrollView>

      <Modal visible={changePinVisible} animationType="slide" transparent>
        <View style={styles.pinModalOverlay}>
          <View style={styles.pinModalCard}>
            <Text style={styles.pinModalTitle}>Change PIN</Text>
            <Text style={styles.pinModalHint}>
              Enter your current PIN, then set and confirm your new 6-digit PIN.
            </Text>

            <Text style={styles.pinFieldLabel}>Current PIN</Text>
            <TextInput
              style={styles.pinField}
              placeholder="Current 6-digit PIN"
              placeholderTextColor="#94a3b8"
              value={currentPin}
              onChangeText={setCurrentPin}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
              editable={!changingPin}
            />

            <Text style={styles.pinFieldLabel}>New PIN</Text>
            <TextInput
              style={styles.pinField}
              placeholder="New 6-digit PIN"
              placeholderTextColor="#94a3b8"
              value={newPin}
              onChangeText={setNewPin}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
              editable={!changingPin}
            />

            <Text style={styles.pinFieldLabel}>Confirm New PIN</Text>
            <TextInput
              style={styles.pinField}
              placeholder="Confirm new PIN"
              placeholderTextColor="#94a3b8"
              value={confirmNewPin}
              onChangeText={setConfirmNewPin}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
              editable={!changingPin}
            />

            <View style={styles.pinModalButtons}>
              <TouchableOpacity
                style={styles.pinCancelButton}
                onPress={() => {
                  setChangePinVisible(false);
                  resetChangePinForm();
                }}
                disabled={changingPin}
              >
                <Text style={styles.pinCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pinSaveButton}
                onPress={submitChangePin}
                disabled={changingPin}
              >
                {changingPin ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.pinSaveText}>Update PIN</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={profileVisible} animationType="slide" transparent>
        <View style={styles.pinModalOverlay}>
          <View style={styles.pinModalCard}>
            <Text style={styles.pinModalTitle}>Profile</Text>
            <Text style={styles.pinModalHint}>
              Profile and verification details.
            </Text>

            <View style={styles.identityHeader}>
              <View style={[styles.iconContainer, { backgroundColor: '#ecfdf5' }]}>
                <MapPin size={20} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemTitle}>Verification status</Text>
                {profile?.kyc_complete ? (
                  <Text style={styles.identityComplete}>Complete</Text>
                ) : (
                  <Text style={styles.identityIncomplete}>Incomplete — wallet features locked</Text>
                )}
              </View>
            </View>

            <View style={styles.profileRow}>
              <Text style={styles.summaryLabel}>Full Name</Text>
              <Text style={styles.summaryValue}>{profile?.full_name || 'User'}</Text>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.summaryLabel}>Phone</Text>
              <Text style={styles.summaryValue}>{profile?.phone || '—'}</Text>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.summaryLabel}>Country</Text>
              <Text style={styles.summaryValue}>{profile?.country || '—'}</Text>
            </View>

            <View style={styles.pinModalButtons}>
              <TouchableOpacity
                style={styles.pinCancelButton}
                onPress={() => setProfileVisible(false)}
              >
                <Text style={styles.pinCancelText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pinSaveButton}
                onPress={() => {
                  setProfileVisible(false);
                  setProfileEditPin('');
                  setShowKycEditor(true);
                  setIsProfileEditMode(true);
                }}
              >
                <Text style={styles.pinSaveText}>Edit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    color: '#6366f1',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  verifiedBadge: {
    backgroundColor: '#dcfce7',
    borderColor: '#22c55e',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  verifiedBadgeText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 24,
    paddingBottom: 0,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  identityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    paddingBottom: 8,
  },
  identityComplete: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
    marginTop: 2,
  },
  identityIncomplete: {
    fontSize: 12,
    color: '#d97706',
    fontWeight: '600',
    marginTop: 2,
  },
  formBlock: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginLeft: 4,
  },
  textField: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1e293b',
  },
  saveIdentityButton: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveIdentityButtonDisabled: {
    opacity: 0.7,
  },
  saveIdentityButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6366f1',
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  menuItemSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginLeft: 68,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    padding: 16,
    margin: 24,
    marginTop: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
  },
  version: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 40,
  },
  pinModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  pinModalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  pinModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#6366f1',
  },
  pinModalHint: {
    marginTop: 6,
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 18,
    color: '#64748b',
  },
  pinFieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  pinField: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#6366f1',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#1e293b',
    marginBottom: 12,
  },
  pinModalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  pinCancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#6366f1',
    borderRadius: 10,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  pinCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
  },
  pinSaveButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 12,
    backgroundColor: '#6366f1',
  },
  pinSaveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
});
