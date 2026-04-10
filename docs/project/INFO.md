Refactor authentication for a mobile fintech wallet.

Login identity must be phone number + 6 digit PIN.
National ID is required for KYC and must be unique.

Requirements:

1. Remove all Node crypto usage. Ensure compatibility with Expo React Native.

2. Signup flow:
- user enters full_name, national_id, country, phone, email(optional), PIN
- enforce UNIQUE constraints on phone and national_id
- hash the PIN using bcryptjs
- generate a random password for Supabase auth
- create Supabase user with email + random password
- store profile in user_profiles with:
  full_name
  national_id
  phone
  email
  hashed_pin
  country
- create wallet record linked to user_id.

3. Login flow:
- user enters phone + PIN
- lookup user_profiles by phone
- verify PIN using bcrypt.compare
- retrieve email
- authenticate with supabase.auth.signInWithPassword

4. After login load profile and identify the user by full_name in the UI, not email.

5. Security:
- phone UNIQUE
- national_id UNIQUE
- hashed_pin stored securely
- clear error handling.

Goal:
Secure phone + PIN authentication with national ID KYC for a mobile capital wallet.