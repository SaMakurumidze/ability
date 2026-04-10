import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;
const PASSWORD_LENGTH = 32;

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS);
}

export async function validatePin(pin: string, hashedPin: string): Promise<boolean> {
  if (!hashedPin || typeof hashedPin !== 'string' || !hashedPin.startsWith('$2')) {
    return false;
  }

  return bcrypt.compare(pin, hashedPin);
}

export async function generateSecurePassword(): Promise<string> {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';

  let password = '';

  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return password;
}

export function formatPhoneNumber(countryCode: string, phoneNumber: string): string {
  const countryDigits = countryCode.replace(/\D/g, '');
  let localDigits = phoneNumber.replace(/\D/g, '');

  // Handle users pasting full international numbers in the local input.
  if (countryDigits && localDigits.startsWith(countryDigits)) {
    localDigits = localDigits.slice(countryDigits.length);
  }

  // E.164 local part should not keep national trunk prefix zero.
  localDigits = localDigits.replace(/^0+/, '');

  return `+${countryDigits}${localDigits}`;
}

export function getPhoneLookupCandidates(countryCode: string, phoneNumber: string): string[] {
  const normalized = formatPhoneNumber(countryCode, phoneNumber);
  const rawCountry = `+${countryCode.replace(/\D/g, '')}`;
  const rawLocal = phoneNumber.replace(/\D/g, '');
  const legacyRaw = `${rawCountry}${rawLocal}`;

  return Array.from(new Set([normalized, legacyRaw]));
}