import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'ability_auth_token';
const USER_KEY = 'ability_user_json';

export type StoredUser = {
  id: string;
  /** Display name from profile — never use email for greetings in the UI. */
  fullName?: string | null;
  email?: string | null;
};

export async function loadStoredSession(): Promise<{ token: string | null; user: StoredUser | null }> {
  try {
    const [token, raw] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ]);
    let user: StoredUser | null = null;
    if (raw) {
      try {
        user = JSON.parse(raw) as StoredUser;
      } catch {
        user = null;
      }
    }
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

export async function saveSession(token: string, user: StoredUser): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  try {
    await SecureStore.deleteItemAsync(USER_KEY);
  } catch {
    /* ignore */
  }
}
