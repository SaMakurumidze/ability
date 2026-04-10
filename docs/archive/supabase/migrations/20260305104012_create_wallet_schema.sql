/*
  # Mobile Wallet Database Schema

  1. New Tables
    - `user_profiles`
      - `id` (uuid, primary key, references auth.users)
      - `pin_hash` (text, encrypted PIN for wallet access)
      - `biometric_enabled` (boolean, whether biometric auth is enabled)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `wallets`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references user_profiles)
      - `chain` (text, blockchain type: BTC, ETH, SOL, etc.)
      - `address` (text, wallet address)
      - `label` (text, user-defined wallet name)
      - `balance` (numeric, current balance)
      - `is_primary` (boolean, primary wallet for this chain)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `transactions`
      - `id` (uuid, primary key)
      - `wallet_id` (uuid, references wallets)
      - `user_id` (uuid, references user_profiles)
      - `type` (text, send/receive)
      - `amount` (numeric, transaction amount)
      - `to_address` (text, recipient address)
      - `from_address` (text, sender address)
      - `tx_hash` (text, blockchain transaction hash)
      - `status` (text, pending/confirmed/failed)
      - `chain` (text, blockchain type)
      - `fee` (numeric, transaction fee)
      - `notes` (text, optional user notes)
      - `created_at` (timestamptz)
    
    - `price_cache`
      - `id` (uuid, primary key)
      - `symbol` (text, crypto symbol)
      - `price_usd` (numeric, current price in USD)
      - `change_24h` (numeric, 24h price change percentage)
      - `updated_at` (timestamptz)
    
    - `user_settings`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references user_profiles)
      - `currency` (text, preferred fiat currency)
      - `notifications_enabled` (boolean)
      - `theme` (text, light/dark/auto)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
    - Restrict access to user's own wallets and transactions
*/

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  pin_hash text,
  biometric_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Create wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  chain text NOT NULL,
  address text NOT NULL,
  label text DEFAULT '',
  balance numeric DEFAULT 0,
  is_primary boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallets"
  ON wallets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wallets"
  ON wallets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wallets"
  ON wallets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own wallets"
  ON wallets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid REFERENCES wallets(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  amount numeric NOT NULL,
  to_address text NOT NULL,
  from_address text NOT NULL,
  tx_hash text,
  status text DEFAULT 'pending',
  chain text NOT NULL,
  fee numeric DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON transactions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create price_cache table (public read access for price data)
CREATE TABLE IF NOT EXISTS price_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text UNIQUE NOT NULL,
  price_usd numeric NOT NULL,
  change_24h numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE price_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view prices"
  ON price_cache FOR SELECT
  TO authenticated
  USING (true);

-- Create user_settings table
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  currency text DEFAULT 'USD',
  notifications_enabled boolean DEFAULT true,
  theme text DEFAULT 'auto',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);