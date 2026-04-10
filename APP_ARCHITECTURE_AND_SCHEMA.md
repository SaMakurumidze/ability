# Ability App Architecture and Database Schema

Last updated: 2026-04-10

## 1) System Architecture (Current)

The repository is a monorepo with three main apps:

- `ability-api`: Express API with Neon Postgres, JWT auth, and business logic.
- `ability-mobile`: Expo React Native investor app.
- `ability-web`: Next.js web app (business/government side).

Top-level reference:

- Root workspace scripts run package-specific commands (for example `npm run dev:api`, `npm run dev:mobile`).
- API is typically served on `PORT` from `ability-api/.env` (commonly `3002`).

## 2) Mobile App Architecture (`ability-mobile`)

### Navigation and app shell

- `app/_layout.tsx` is the root shell:
  - wraps app with `ThemeProvider`, `AuthProvider`, `SafeAreaProvider`
  - defines stack routes for auth screens, tabs, and modal flows
  - enforces auth routing (`/auth/*` vs `/(tabs)`)
  - enforces inactivity auto-sign-out after 3 minutes

### Main user areas

- Auth: `app/auth/login.tsx`, `app/auth/signup.tsx`
- Main tabs: `app/(tabs)/index.tsx`, `history.tsx`, `updates.tsx`, `settings.tsx`
- Modal transaction flows:
  - `app/modals/xchange.tsx`
  - `app/modals/invest.tsx`
  - `app/modals/withdraw.tsx`

### Client-side state and context

- Auth/session: `contexts/AuthContext`
- Theme state: `contexts/ThemeContext` (currently enforced to light in Settings flow)
- API utility layer: `lib/api.ts` (base URL resolution, wrapped fetch helpers, timeout/error helpers)

### Current business behavior highlights

- KYC and transaction PIN are required for wallet actions.
- PIN is used for transaction authorization and PIN-change flow.
- History/Updates screens refresh on focus and support tab badge behaviors.
- Withdraw flow supports:
  - bank selection by user country (`/api/banks`)
  - mobile money provider selection by country
  - amount validation (exceeding balance disables Continue)

## 3) API Architecture (`ability-api`)

Single Express service (`src/index.ts`) with:

- `cors` + JSON middleware
- JWT auth middleware (`requireAuth`, `getAuth`)
- Neon Postgres access via `@neondatabase/serverless`
- startup schema bootstrap + legacy table migration helpers

### Security/validation pattern

- KYC checks: `assertKycComplete(...)`
- KYC + PIN checks: `assertKycAndTransactionPin(...)`
- Password and PIN hashing via `bcryptjs`
- JWT-issued access token flow for mobile auth

### Main API groups (current)

- Auth:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
- Profile/self:
  - `GET /api/me`
  - `PATCH /api/me/kyc`
  - `PATCH /api/me/pin`
  - `PATCH /api/me/profile`
  - `PATCH /api/me/settings`
  - `PATCH /api/me/biometric`
  - `GET /api/profile/lookup`
- Wallet/transactions:
  - `POST /api/wallet/xchange`
  - `POST /api/wallet/withdraw`
  - `GET /api/transactions`
- Notifications:
  - `GET /api/notifications`
  - `PATCH /api/notifications/:id/read`
- Investments:
  - `GET /api/pending-investments`
  - `POST /api/pending-investments/:id/authorize`
  - `POST /api/pending-investments/:id/cancel`
- Banks:
  - `GET /api/banks?country=<country>`
- Health/admin:
  - `GET /health`
  - `GET /api/admin/profiles`
  - `PATCH /api/admin/profiles/:targetUserId`

## 4) Database Schema and Tables (Neon Postgres)

Schema is initialized in `ability-api/src/index.ts` (`ensureSchema()`), with migration helpers for legacy layouts.

## 4.1 Core identity tables

### `users`

- `id UUID PK DEFAULT gen_random_uuid()`
- `email TEXT UNIQUE NOT NULL`
- `phone TEXT UNIQUE NOT NULL`
- `password_hash TEXT NOT NULL`
- `created_at TIMESTAMPTZ DEFAULT NOW()`
- `updated_at TIMESTAMPTZ DEFAULT NOW()`

### `user_profiles`

- `user_id UUID PK REFERENCES users(id) ON DELETE CASCADE`
- `full_name TEXT NOT NULL`
- `national_id TEXT UNIQUE` (nullable)
- `country TEXT` (nullable)
- `biometric_enabled BOOLEAN NOT NULL DEFAULT false`
- `pin_hash TEXT` (hashed transaction PIN)
- `created_at TIMESTAMPTZ DEFAULT NOW()`
- `updated_at TIMESTAMPTZ DEFAULT NOW()`

### `user_settings`

- `id UUID PK DEFAULT gen_random_uuid()`
- `user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `currency TEXT NOT NULL DEFAULT 'USD'`
- `notifications_enabled BOOLEAN NOT NULL DEFAULT true`
- `theme TEXT NOT NULL DEFAULT 'light'`
- `created_at TIMESTAMPTZ DEFAULT NOW()`
- `updated_at TIMESTAMPTZ DEFAULT NOW()`

## 4.2 Wallet and ledger tables

### `wallets`

- `id UUID PK DEFAULT gen_random_uuid()`
- `user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `balance_usd NUMERIC(14,2) NOT NULL DEFAULT 1000`
- `wallet_type TEXT NOT NULL DEFAULT 'INDIVIDUAL'`
- `status TEXT NOT NULL DEFAULT 'ACTIVE'`
- `created_at TIMESTAMPTZ DEFAULT NOW()`
- `updated_at TIMESTAMPTZ DEFAULT NOW()`

### `transactions`

- `id UUID PK DEFAULT gen_random_uuid()`
- `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `transaction_type TEXT NOT NULL`  
  (used values include: `XCHANGE`, `RECEIVE`, `INVEST`, `WITHDRAW`, `INJECT`)
- `amount_usd NUMERIC(14,2) NOT NULL`
- `status TEXT NOT NULL DEFAULT 'CONFIRMED'`
- `description TEXT`
- `sender_name TEXT`
- `sender_phone TEXT`
- `recipient_name TEXT`
- `recipient_phone TEXT`
- `company_name TEXT`
- `created_at TIMESTAMPTZ DEFAULT NOW()`

## 4.3 Notifications and investment workflow

### `notifications`

- `id UUID PK DEFAULT gen_random_uuid()`
- `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `type TEXT NOT NULL DEFAULT 'info'`
- `title TEXT NOT NULL`
- `message TEXT NOT NULL`
- `is_read BOOLEAN NOT NULL DEFAULT false`
- `created_at TIMESTAMPTZ DEFAULT NOW()`

### `pending_investments`

- `id UUID PK DEFAULT gen_random_uuid()`
- `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `company_name TEXT NOT NULL`
- `price_per_share NUMERIC(14,2) NOT NULL`
- `number_of_shares INT NOT NULL`
- `total_amount NUMERIC(14,2) NOT NULL`
- `status TEXT NOT NULL DEFAULT 'PENDING'`
- `created_at TIMESTAMPTZ DEFAULT NOW()`

## 4.4 Banking reference table

### `banks`

- `id UUID PK DEFAULT gen_random_uuid()`
- `country TEXT NOT NULL`
- `name TEXT NOT NULL`
- `code TEXT NOT NULL`
- `created_at TIMESTAMPTZ DEFAULT NOW()`
- `UNIQUE (country, code)`

The table is seeded on startup and queried by `GET /api/banks` using country and `ORDER BY name`.

## 5) Important internal DB function

### `wallet_transfer_usd(sender_user, recipient_user, amt)`

PL/pgSQL function that:

- prevents self-transfer
- atomically debits sender (with balance check)
- credits recipient
- throws domain exceptions for missing wallet/insufficient funds

Used by Xchange flow to keep wallet movement consistent and safer than split client-side operations.

## 6) Runtime and config summary

- API config from `ability-api/.env`:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `PORT`
  - optional `ADMIN_USER_IDS`
- Mobile config from `ability-mobile/.env`:
  - `EXPO_PUBLIC_API_URL`
  - optional lock/port helpers used by dev scripts

## 7) Notes

- Schema migration helpers are included to rebuild legacy tables when old non-UUID user linkage is detected.
- Theme defaults are persisted as light in DB and enforced in current Settings behavior.
- Biometric toggle UI is currently removed from Settings (while biometric field remains in schema).
