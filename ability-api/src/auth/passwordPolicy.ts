/** Match mobile `lib/passwordPolicy.ts` rules for account passwords. */
const SPECIAL_CHARS = '!@#$%^&*()_+-=[]{}|;:\'",.<>/?`~\\';

function hasSpecialCharacter(password: string): boolean {
  return [...password].some((c) => SPECIAL_CHARS.includes(c));
}

export function validateSignupPassword(password: string): string | null {
  if (password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include at least one lowercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include at least one number.';
  }
  if (!hasSpecialCharacter(password)) {
    return 'Password must include at least one special character (e.g. !@#$%^&*).';
  }
  return null;
}
