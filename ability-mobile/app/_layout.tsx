import { useEffect, useRef, useCallback } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { View, ActivityIndicator, StyleSheet, AppState, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000;

function RootLayoutNav() {
  const { session, loading, signOut } = useAuth();
  const { theme, loaded: themeLoaded } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastBackgroundedAtRef = useRef<number | null>(null);
  const signingOutRef = useRef(false);

  const handleAutoSignOut = useCallback(async () => {
    if (signingOutRef.current || !session) return;
    signingOutRef.current = true;
    try {
      await signOut();
      router.replace('/auth/login');
    } finally {
      signingOutRef.current = false;
    }
  }, [session, signOut, router]);

  const resetInactivityTimer = useCallback(() => {
    if (!session) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      handleAutoSignOut();
    }, INACTIVITY_TIMEOUT_MS);
  }, [session, handleAutoSignOut]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!session && !inAuthGroup) {
      router.replace('/auth/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router]);

  useEffect(() => {
    if (!session) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      return;
    }
    resetInactivityTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [session, resetInactivityTimer]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      if (!session) return;

      if (prev === 'active' && /inactive|background/.test(nextState)) {
        lastBackgroundedAtRef.current = Date.now();
        return;
      }

      if (/inactive|background/.test(prev) && nextState === 'active') {
        const bgAt = lastBackgroundedAtRef.current;
        lastBackgroundedAtRef.current = null;
        if (bgAt && Date.now() - bgAt >= INACTIVITY_TIMEOUT_MS) {
          handleAutoSignOut();
          return;
        }
        resetInactivityTimer();
      }
    });
    return () => sub.remove();
  }, [session, handleAutoSignOut, resetInactivityTimer]);

  if (loading || !themeLoaded) {
    return (
      <View style={[styles.container, { backgroundColor: theme === 'dark' ? '#020617' : '#f8fafc' }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme === 'dark' ? '#020617' : '#f8fafc' },
      ]}
      onTouchStart={resetInactivityTimer}
    >
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme === 'dark' ? '#020617' : '#f8fafc' },
        }}
      >
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/signup" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="modals/xchange"
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen
          name="modals/invest"
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen
          name="modals/withdraw"
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen name="+not-found" />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  useFrameworkReady();

  return (
    <ThemeProvider>
      <AuthProvider>
        <SafeAreaProvider>
          <RootLayoutNav />
          <ThemeStatusBar />
        </SafeAreaProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

function ThemeStatusBar() {
  const { theme } = useTheme();
  return <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
});
