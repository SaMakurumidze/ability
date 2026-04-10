import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { formatPhoneNumber } from '@/lib/auth';
import { apiFailureMessage, describeFetchError, fetchJson, getApiBaseUrl } from '@/lib/api';
import { clearSession, loadStoredSession, saveSession, type StoredUser } from '@/lib/authStorage';

type AuthContextType = {
  session: { id: string } | null;
  user: { id: string; fullName?: string | null; email?: string | null } | null;
  loading: boolean;
  signIn: (countryCode: string, phoneNumber: string, password: string) => Promise<{ error: any }>;
  signUp: (
    fullName: string,
    email: string,
    countryCode: string,
    phoneNumber: string,
    password: string
  ) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; fullName?: string | null; email?: string | null } | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { token: t, user: u } = await loadStoredSession();
      if (cancelled) return;
      setToken(t);
      setUser(u);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = async (countryCode: string, phoneNumber: string, password: string) => {
    try {
      const phone = formatPhoneNumber(countryCode, phoneNumber);
      const baseUrl = getApiBaseUrl();
      const { res, data, rawText } = await fetchJson(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });
      if (!res.ok) {
        return { error: { message: apiFailureMessage(res, data, rawText, baseUrl) } };
      }
      if (!data?.token || typeof data.token !== 'string') {
        return { error: { message: 'Invalid response from server (missing token).' } };
      }
      const userObj = data.user as {
        id?: string;
        email?: string | null;
        full_name?: string | null;
      } | undefined;
      const uid = userObj?.id;
      if (!uid || typeof uid !== 'string') {
        return { error: { message: 'Invalid response from server (missing user id).' } };
      }
      const fn = typeof userObj?.full_name === 'string' ? userObj.full_name.trim() : '';
      const nextUser: StoredUser = {
        id: uid,
        fullName: fn || null,
        email: userObj?.email ?? null,
      };
      await saveSession(data.token, nextUser);
      setToken(data.token);
      setUser(nextUser);
      return { error: null };
    } catch (err: any) {
      let base = '';
      try {
        base = getApiBaseUrl();
      } catch {
        base = '(set EXPO_PUBLIC_API_URL)';
      }
      return { error: { message: describeFetchError(base, err) } };
    }
  };

  const signUp = async (
    fullName: string,
    email: string,
    countryCode: string,
    phoneNumber: string,
    password: string
  ) => {
    try {
      const baseUrl = getApiBaseUrl();
      const phone = formatPhoneNumber(countryCode, phoneNumber);
      const emailTrim = email.trim();
      const { res, data, rawText } = await fetchJson(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: emailTrim,
          phone,
          password,
        }),
      });
      if (!res.ok) {
        return { error: { message: apiFailureMessage(res, data, rawText, baseUrl) } };
      }
      if (!data?.token || typeof data.token !== 'string') {
        return { error: { message: 'Invalid response from server (missing token).' } };
      }
      const userObj = data.user as {
        id?: string;
        email?: string | null;
        full_name?: string | null;
      } | undefined;
      const uid = userObj?.id;
      if (!uid || typeof uid !== 'string') {
        return { error: { message: 'Invalid response from server (missing user id).' } };
      }
      const apiName = typeof userObj?.full_name === 'string' ? userObj.full_name.trim() : '';
      const nextUser: StoredUser = {
        id: uid,
        fullName: apiName || fullName.trim() || null,
        email: userObj?.email ?? emailTrim,
      };
      await saveSession(data.token, nextUser);
      setToken(data.token);
      setUser(nextUser);
      return { error: null };
    } catch (err: any) {
      let base = '';
      try {
        base = getApiBaseUrl();
      } catch {
        base = '(set EXPO_PUBLIC_API_URL)';
      }
      return { error: { message: describeFetchError(base, err) } };
    }
  };

  const signOut = async () => {
    await clearSession();
    setToken(null);
    setUser(null);
  };

  const getToken = useCallback(async () => token, [token]);

  const session = token && user ? { id: user.id } : null;

  const value = {
    session,
    user,
    loading,
    signIn,
    signUp,
    signOut,
    getToken,
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
