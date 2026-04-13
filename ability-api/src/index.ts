import express, { type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { createHmac, randomUUID } from 'crypto';
import { neon } from '@neondatabase/serverless';
import { signAccessToken, requireJwtSecret } from './auth/jwt';
import { validateSignupPassword } from './auth/passwordPolicy';
import { getAuth, requireAuth } from './middleware/requireAuth';

dotenv.config();

requireJwtSecret();

const app = express();
const port = Number(process.env.PORT || 3000);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL for Neon Postgres.');
}

const sql = neon(databaseUrl);

const BCRYPT_ROUNDS = 10;
const WALLET_CLASSES = [
  'investor',
  'issuer_company',
  'issuer_government',
  'business_vendor',
  'business_contractor',
] as const;
type WalletClass = (typeof WALLET_CLASSES)[number];
const WALLET_CLASS_SET = new Set<string>(WALLET_CLASSES);

function isWalletClass(value: unknown): value is WalletClass {
  return typeof value === 'string' && WALLET_CLASS_SET.has(value.trim().toLowerCase());
}

function normalizeWalletClass(value: unknown, fallback: WalletClass = 'investor'): WalletClass {
  if (!isWalletClass(value)) return fallback;
  return value.trim().toLowerCase() as WalletClass;
}

type KycRow = {
  country: string | null;
  national_id: string | null;
  pin_hash: string | null;
};

async function loadKycRow(userId: string): Promise<KycRow | null> {
  const [row] = await sql`
    SELECT country, national_id, pin_hash
    FROM user_profiles
    WHERE user_id = ${userId}
    LIMIT 1
  `;
  return (row as KycRow | undefined) ?? null;
}

async function loadWalletClass(userId: string): Promise<WalletClass> {
  const [row] = await sql`
    SELECT wallet_class
    FROM user_profiles
    WHERE user_id = ${userId}::uuid
    LIMIT 1
  `;
  return normalizeWalletClass((row as { wallet_class?: string } | undefined)?.wallet_class, 'investor');
}

function isKycCompleteRow(row: KycRow | null): boolean {
  if (!row) return false;
  const c = row.country?.trim() ?? '';
  const n = row.national_id?.trim() ?? '';
  return Boolean(c && n && row.pin_hash);
}

async function assertKycComplete(userId: string | null | undefined, res: Response): Promise<boolean> {
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  const walletClass = await loadWalletClass(userId);
  if (walletClass !== 'investor') {
    return true;
  }
  const row = await loadKycRow(userId);
  if (!isKycCompleteRow(row)) {
    res.status(403).json({
      error: 'Complete KYC (country, national ID, and transaction PIN) in Settings.',
      code: 'KYC_REQUIRED',
    });
    return false;
  }
  return true;
}

async function assertWalletClass(
  userId: string | null | undefined,
  allowed: WalletClass[],
  res: Response
): Promise<boolean> {
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  const walletClass = await loadWalletClass(userId);
  if (!allowed.includes(walletClass)) {
    res.status(403).json({
      error: `Wallet class "${walletClass}" is not permitted for this operation.`,
      code: 'WALLET_CLASS_NOT_ALLOWED',
      wallet_class: walletClass,
      allowed_wallet_classes: allowed,
    });
    return false;
  }
  return true;
}

async function assertKycAndTransactionPin(
  userId: string | null | undefined,
  pin: unknown,
  res: Response
): Promise<boolean> {
  if (!(await assertKycComplete(userId, res))) return false;
  const pinStr = typeof pin === 'string' ? pin.trim() : '';
  if (!/^\d{6}$/.test(pinStr)) {
    res.status(400).json({ error: 'Enter your 6-digit transaction PIN to authorize.' });
    return false;
  }
  const row = await loadKycRow(userId!);
  if (!row?.pin_hash || !(await bcrypt.compare(pinStr, row.pin_hash))) {
    res.status(401).json({ error: 'Incorrect PIN.' });
    return false;
  }
  return true;
}

function parseAdminUserIds(): Set<string> {
  const raw = process.env.ADMIN_USER_IDS || '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function isAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return parseAdminUserIds().has(userId);
}

const PRIVATEEX_WEBHOOK_URL =
  process.env.PRIVATEEX_WEBHOOK_URL ||
  'https://www.privateex.online/api/ability/investment-status';
const PRIVATEEX_API_KEY = process.env.PRIVATEEX_API_KEY || '';
const PRIVATEEX_WEBHOOK_SECRET = process.env.PRIVATEEX_WEBHOOK_SECRET || PRIVATEEX_API_KEY;
const PLATFORM_ESCROW_ENTITY_ID =
  process.env.PLATFORM_ESCROW_ENTITY_ID || '00000000-0000-0000-0000-000000000001';
const PLATFORM_REVENUE_ENTITY_ID =
  process.env.PLATFORM_REVENUE_ENTITY_ID || '00000000-0000-0000-0000-000000000002';
const SETTLEMENT_FEE_BPS = Math.max(0, Number(process.env.SETTLEMENT_FEE_BPS || '50'));
type IssuerEntityType = 'company' | 'government';

function normalizeIssuerEntityType(value: unknown): IssuerEntityType {
  return String(value || 'company').trim().toLowerCase() === 'government'
    ? 'government'
    : 'company';
}

function issuerEntityIdOrLegacy(
  issuerEntityId: unknown,
  companyId: unknown,
  issuerType: IssuerEntityType
): string {
  if (isUuid(issuerEntityId)) return issuerEntityId;
  if (issuerType === 'company' && isUuid(companyId)) return companyId;
  return String(issuerEntityId || companyId || '');
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function isUuid(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

async function getOrCreateUserWalletAccount(userId: string) {
  const [existing] = await sql`
    SELECT account_id, balance::text AS balance
    FROM wallet_accounts
    WHERE entity_id = ${userId}::uuid
      AND entity_type = 'user'
      AND account_type = 'user_wallet'
    LIMIT 1
  `;
  if (existing) return existing as { account_id: string; balance: string };

  const [w] = await sql`
    SELECT balance_usd::text AS balance_usd
    FROM wallets
    WHERE user_id = ${userId}::uuid
    LIMIT 1
  `;
  const seed = Number((w as { balance_usd?: string } | undefined)?.balance_usd ?? '0').toFixed(2);
  const [created] = await sql`
    INSERT INTO wallet_accounts (
      entity_id, entity_type, account_type, currency, balance, status
    )
    VALUES (${userId}::uuid, 'user', 'user_wallet', 'USD', ${seed}::numeric, 'ACTIVE')
    RETURNING account_id, balance::text AS balance
  `;
  return created as { account_id: string; balance: string };
}

async function getOrCreateEscrowWalletAccount() {
  const [existing] = await sql`
    SELECT account_id, balance::text AS balance
    FROM wallet_accounts
    WHERE entity_id = ${PLATFORM_ESCROW_ENTITY_ID}::uuid
      AND entity_type = 'platform'
      AND account_type = 'investment_escrow_wallet'
    LIMIT 1
  `;
  if (existing) return existing as { account_id: string; balance: string };
  const [created] = await sql`
    INSERT INTO wallet_accounts (
      entity_id, entity_type, account_type, currency, balance, status
    )
    VALUES (${PLATFORM_ESCROW_ENTITY_ID}::uuid, 'platform', 'investment_escrow_wallet', 'USD', 0, 'ACTIVE')
    RETURNING account_id, balance::text AS balance
  `;
  return created as { account_id: string; balance: string };
}

async function getOrCreateCompanyWalletAccount(companyId: string) {
  const [existing] = await sql`
    SELECT account_id, balance::text AS balance
    FROM wallet_accounts
    WHERE entity_id = ${companyId}::uuid
      AND entity_type = 'company'
      AND account_type = 'company_wallet'
    LIMIT 1
  `;
  if (existing) return existing as { account_id: string; balance: string };
  const [created] = await sql`
    INSERT INTO wallet_accounts (
      entity_id, entity_type, account_type, currency, balance, status
    )
    VALUES (${companyId}::uuid, 'company', 'company_wallet', 'USD', 0, 'ACTIVE')
    RETURNING account_id, balance::text AS balance
  `;
  return created as { account_id: string; balance: string };
}

async function getOrCreateGovernmentWalletAccount(entityId: string) {
  const [existing] = await sql`
    SELECT account_id, balance::text AS balance
    FROM wallet_accounts
    WHERE entity_id = ${entityId}::uuid
      AND entity_type = 'government'
      AND account_type = 'government_wallet'
    LIMIT 1
  `;
  if (existing) return existing as { account_id: string; balance: string };
  const [created] = await sql`
    INSERT INTO wallet_accounts (
      entity_id, entity_type, account_type, currency, balance, status
    )
    VALUES (${entityId}::uuid, 'government', 'government_wallet', 'USD', 0, 'ACTIVE')
    RETURNING account_id, balance::text AS balance
  `;
  return created as { account_id: string; balance: string };
}

async function getOrCreateRevenueWalletAccount() {
  const [existing] = await sql`
    SELECT account_id, balance::text AS balance
    FROM wallet_accounts
    WHERE entity_id = ${PLATFORM_REVENUE_ENTITY_ID}::uuid
      AND entity_type = 'platform'
      AND account_type = 'platform_revenue_wallet'
    LIMIT 1
  `;
  if (existing) return existing as { account_id: string; balance: string };
  const [created] = await sql`
    INSERT INTO wallet_accounts (
      entity_id, entity_type, account_type, currency, balance, status
    )
    VALUES (${PLATFORM_REVENUE_ENTITY_ID}::uuid, 'platform', 'platform_revenue_wallet', 'USD', 0, 'ACTIVE')
    RETURNING account_id, balance::text AS balance
  `;
  return created as { account_id: string; balance: string };
}

async function resolveIssuerSettlementAccount(
  issuerType: IssuerEntityType,
  issuerEntityId: string
): Promise<{ account_id: string; issuer_name: string }> {
  if (issuerType === 'government') {
    const [governmentWallet] = await sql`
      SELECT wa.account_id, ge.department_name
      FROM government_entities ge
      JOIN wallet_accounts wa ON wa.account_id = ge.wallet_account_id
      WHERE ge.entity_id = ${issuerEntityId}::uuid
      LIMIT 1
    `;
    if (!governmentWallet) {
      throw new Error('Government issuer wallet not configured.');
    }
    return {
      account_id: (governmentWallet as { account_id: string }).account_id,
      issuer_name: (governmentWallet as { department_name?: string }).department_name || 'Government Issuer',
    };
  }

  const [companyWallet] = await sql`
    SELECT wa.account_id, c.company_name
    FROM companies c
    JOIN wallet_accounts wa ON wa.account_id = c.wallet_account_id
    WHERE c.company_id = ${issuerEntityId}::uuid
    LIMIT 1
  `;
  if (!companyWallet) {
    throw new Error('Company issuer wallet not configured.');
  }
  return {
    account_id: (companyWallet as { account_id: string }).account_id,
    issuer_name: (companyWallet as { company_name?: string }).company_name || 'Company Issuer',
  };
}

type SettlementInput = {
  investment_id: string;
  investment_request_id: string;
  investor_user_id: string;
  issuer_entity_type: IssuerEntityType;
  issuer_entity_id: string;
  issuer_name: string;
  total_amount: string;
  currency: string;
};

async function processInvestmentSettlement(input: SettlementInput) {
  const grossAmount = roundMoney(Number(input.total_amount));
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
    throw new Error('Invalid settlement amount.');
  }

  const investorAccount = await getOrCreateUserWalletAccount(input.investor_user_id);
  if (Number(investorAccount.balance) < grossAmount) {
    throw new Error('Insufficient balance.');
  }
  const escrowAccount = await getOrCreateEscrowWalletAccount();
  const revenueAccount = await getOrCreateRevenueWalletAccount();
  const issuerAccount = await resolveIssuerSettlementAccount(
    input.issuer_entity_type,
    input.issuer_entity_id
  );

  const feeAmount = roundMoney((grossAmount * SETTLEMENT_FEE_BPS) / 10000);
  const netAmount = roundMoney(grossAmount - feeAmount);
  if (netAmount < 0) {
    throw new Error('Settlement net amount cannot be negative.');
  }

  const txId = input.investment_request_id;
  const ccy = input.currency || 'USD';
  const statements = [
    sql`
      UPDATE wallet_accounts
      SET balance = balance - ${grossAmount.toFixed(2)}::numeric
      WHERE account_id = ${investorAccount.account_id}::uuid
    `,
    sql`
      UPDATE wallet_accounts
      SET balance = balance + ${grossAmount.toFixed(2)}::numeric
      WHERE account_id = ${escrowAccount.account_id}::uuid
    `,
    sql`
      INSERT INTO ledger_entries (
        transaction_id, account_id, debit, credit, currency, reference_type, reference_id
      ) VALUES
      (${txId}::uuid, ${investorAccount.account_id}::uuid, ${grossAmount.toFixed(2)}::numeric, 0, ${ccy}, 'investment_settlement', ${txId}::uuid),
      (${txId}::uuid, ${escrowAccount.account_id}::uuid, 0, ${grossAmount.toFixed(2)}::numeric, ${ccy}, 'investment_settlement', ${txId}::uuid)
    `,
    sql`
      UPDATE wallet_accounts
      SET balance = balance - ${grossAmount.toFixed(2)}::numeric
      WHERE account_id = ${escrowAccount.account_id}::uuid
    `,
    sql`
      UPDATE wallet_accounts
      SET balance = balance + ${netAmount.toFixed(2)}::numeric
      WHERE account_id = ${issuerAccount.account_id}::uuid
    `,
    sql`
      INSERT INTO ledger_entries (
        transaction_id, account_id, debit, credit, currency, reference_type, reference_id
      ) VALUES
      (${txId}::uuid, ${escrowAccount.account_id}::uuid, ${grossAmount.toFixed(2)}::numeric, 0, ${ccy}, 'investment_settlement', ${txId}::uuid),
      (${txId}::uuid, ${issuerAccount.account_id}::uuid, 0, ${netAmount.toFixed(2)}::numeric, ${ccy}, 'investment_settlement', ${txId}::uuid)
    `,
    sql`
      UPDATE wallets
      SET balance_usd = balance_usd - ${grossAmount.toFixed(2)}::numeric, updated_at = NOW()
      WHERE user_id = ${input.investor_user_id}::uuid
    `,
    sql`
      UPDATE pending_investments
      SET
        status = 'authorized',
        settlement_status = 'settled',
        fee_amount = ${feeAmount.toFixed(2)}::numeric,
        net_amount = ${netAmount.toFixed(2)}::numeric,
        settlement_completed_at = NOW()
      WHERE id = ${input.investment_id}::uuid
    `,
    sql`
      INSERT INTO transactions (user_id, transaction_type, amount_usd, status, company_name, description)
      VALUES (
        ${input.investor_user_id}::uuid,
        'INVEST',
        ${grossAmount.toFixed(2)}::numeric,
        'CONFIRMED',
        ${input.issuer_name},
        ${`Settlement ${txId} (fee ${feeAmount.toFixed(2)}, net ${netAmount.toFixed(2)})`}
      )
    `,
    sql`
      INSERT INTO investment_settlements (
        investment_request_id,
        pending_investment_id,
        investor_user_id,
        issuer_entity_type,
        issuer_entity_id,
        gross_amount,
        fee_amount,
        net_amount,
        currency,
        status,
        processed_at
      )
      VALUES (
        ${txId}::uuid,
        ${input.investment_id}::uuid,
        ${input.investor_user_id}::uuid,
        ${input.issuer_entity_type},
        ${input.issuer_entity_id}::uuid,
        ${grossAmount.toFixed(2)}::numeric,
        ${feeAmount.toFixed(2)}::numeric,
        ${netAmount.toFixed(2)}::numeric,
        ${ccy},
        'settled',
        NOW()
      )
      ON CONFLICT (investment_request_id)
      DO UPDATE SET
        fee_amount = EXCLUDED.fee_amount,
        net_amount = EXCLUDED.net_amount,
        status = EXCLUDED.status,
        processed_at = EXCLUDED.processed_at
    `,
  ];

  if (feeAmount > 0) {
    statements.splice(
      6,
      0,
      sql`
        UPDATE wallet_accounts
        SET balance = balance + ${feeAmount.toFixed(2)}::numeric
        WHERE account_id = ${revenueAccount.account_id}::uuid
      `,
      sql`
        INSERT INTO ledger_entries (
          transaction_id, account_id, debit, credit, currency, reference_type, reference_id
        ) VALUES
        (${txId}::uuid, ${revenueAccount.account_id}::uuid, 0, ${feeAmount.toFixed(2)}::numeric, ${ccy}, 'settlement_fee', ${txId}::uuid)
      `
    );
  }

  await sql.transaction(statements);
  return {
    gross_amount: grossAmount.toFixed(2),
    fee_amount: feeAmount.toFixed(2),
    net_amount: netAmount.toFixed(2),
    currency: ccy,
  };
}

async function sendPrivateExWebhook(payload: Record<string, unknown>) {
  try {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (PRIVATEEX_API_KEY) headers['x-ability-key'] = PRIVATEEX_API_KEY;
    if (PRIVATEEX_WEBHOOK_SECRET) {
      headers['x-ability-signature'] = createHmac('sha256', PRIVATEEX_WEBHOOK_SECRET)
        .update(body)
        .digest('hex');
    }
    await fetch(PRIVATEEX_WEBHOOK_URL, {
      method: 'POST',
      headers,
      body,
    });
  } catch (e) {
    console.error('privateex webhook failed', e);
  }
}

app.use(cors());
app.use(express.json());

async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      wallet_class TEXT NOT NULL DEFAULT 'investor',
      national_id TEXT UNIQUE,
      country TEXT,
      biometric_enabled BOOLEAN NOT NULL DEFAULT false,
      pin_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS wallets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      balance_usd NUMERIC(14,2) NOT NULL DEFAULT 1000,
      wallet_type TEXT NOT NULL DEFAULT 'investor',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS wallet_class TEXT`;
  await sql`UPDATE user_profiles SET wallet_class = 'investor' WHERE wallet_class IS NULL OR wallet_class NOT IN ('investor','issuer_company','issuer_government','business_vendor','business_contractor')`;
  await sql`ALTER TABLE user_profiles ALTER COLUMN wallet_class SET DEFAULT 'investor'`;
  await sql`ALTER TABLE user_profiles ALTER COLUMN wallet_class SET NOT NULL`;
  await sql`ALTER TABLE wallets ALTER COLUMN wallet_type SET DEFAULT 'investor'`;
  await sql`UPDATE wallets SET wallet_type = 'investor' WHERE wallet_type IS NULL OR wallet_type = 'INDIVIDUAL'`;
  await sql`UPDATE wallets w SET wallet_type = up.wallet_class FROM user_profiles up WHERE up.user_id = w.user_id AND w.wallet_type <> up.wallet_class`;
  await sql`ALTER TABLE wallets ALTER COLUMN wallet_type SET NOT NULL`;
  await sql`ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_wallet_class_check`;
  await sql`ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_wallet_class_check CHECK (wallet_class IN ('investor','issuer_company','issuer_government','business_vendor','business_contractor'))`;
  await sql`ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_wallet_type_check`;
  await sql`ALTER TABLE wallets ADD CONSTRAINT wallets_wallet_type_check CHECK (wallet_type IN ('investor','issuer_company','issuer_government','business_vendor','business_contractor'))`;

  await sql`
    CREATE TABLE IF NOT EXISTS issuer_wallet_profiles (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      issuer_kind TEXT NOT NULL CHECK (issuer_kind IN ('company','government')),
      issuer_name TEXT NOT NULL,
      company_id UUID,
      government_entity_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS business_wallet_profiles (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      business_type TEXT NOT NULL CHECK (business_type IN ('vendor','contractor')),
      business_name TEXT NOT NULL,
      linked_issuer_user_id UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE issuer_wallet_profiles ADD COLUMN IF NOT EXISTS company_id UUID`;
  await sql`ALTER TABLE issuer_wallet_profiles ADD COLUMN IF NOT EXISTS government_entity_id UUID`;
  await sql`ALTER TABLE business_wallet_profiles ADD COLUMN IF NOT EXISTS linked_issuer_user_id UUID REFERENCES users(id)`;
  await sql`ALTER TABLE wallets ALTER COLUMN balance_usd SET DEFAULT 1000`;

  await sql`
    CREATE TABLE IF NOT EXISTS user_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      currency TEXT NOT NULL DEFAULT 'USD',
      notifications_enabled BOOLEAN NOT NULL DEFAULT true,
      theme TEXT NOT NULL DEFAULT 'light',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE user_settings ALTER COLUMN theme SET DEFAULT 'light'`;
  await sql`UPDATE user_settings SET theme = 'light' WHERE theme = 'auto'`;

  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      transaction_type TEXT NOT NULL,
      amount_usd NUMERIC(14,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'CONFIRMED',
      description TEXT,
      sender_name TEXT,
      sender_phone TEXT,
      recipient_name TEXT,
      recipient_phone TEXT,
      company_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sender_name TEXT`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sender_phone TEXT`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recipient_phone TEXT`;

  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS pending_investments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_name TEXT NOT NULL,
      price_per_share NUMERIC(14,2) NOT NULL,
      number_of_shares INT NOT NULL,
      total_amount NUMERIC(14,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE pending_investments ADD COLUMN IF NOT EXISTS ability_reference_id UUID`;
  await sql`ALTER TABLE pending_investments ADD COLUMN IF NOT EXISTS investment_request_id UUID`;
  await sql`ALTER TABLE pending_investments ADD COLUMN IF NOT EXISTS company_id UUID`;
  await sql`ALTER TABLE pending_investments ADD COLUMN IF NOT EXISTS share_quantity INTEGER`;
  await sql`ALTER TABLE pending_investments ADD COLUMN IF NOT EXISTS currency VARCHAR DEFAULT 'USD'`;
  await sql`ALTER TABLE pending_investments ADD COLUMN IF NOT EXISTS origin VARCHAR DEFAULT 'privateex'`;
  await sql`ALTER TABLE pending_investments ADD COLUMN IF NOT EXISTS issuer_entity_type VARCHAR DEFAULT 'company'`;
  await sql`ALTER TABLE pending_investments ADD COLUMN IF NOT EXISTS issuer_entity_id UUID`;
  await sql`ALTER TABLE pending_investments ADD COLUMN IF NOT EXISTS settlement_status VARCHAR DEFAULT 'pending'`;
  await sql`ALTER TABLE pending_investments ADD COLUMN IF NOT EXISTS settlement_completed_at TIMESTAMPTZ`;
  await sql`ALTER TABLE pending_investments ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(14,2) DEFAULT 0`;
  await sql`ALTER TABLE pending_investments ADD COLUMN IF NOT EXISTS net_amount NUMERIC(14,2) DEFAULT 0`;
  await sql`ALTER TABLE pending_investments ALTER COLUMN status SET DEFAULT 'pending_authorization'`;
  await sql`
    UPDATE pending_investments
    SET
      ability_reference_id = COALESCE(ability_reference_id, id),
      investment_request_id = COALESCE(investment_request_id, id),
      issuer_entity_type = COALESCE(issuer_entity_type, 'company'),
      issuer_entity_id = COALESCE(issuer_entity_id, company_id),
      settlement_status = COALESCE(settlement_status, 'pending'),
      fee_amount = COALESCE(fee_amount, 0),
      net_amount = COALESCE(net_amount, total_amount),
      share_quantity = COALESCE(share_quantity, number_of_shares),
      currency = COALESCE(currency, 'USD'),
      origin = COALESCE(origin, 'ability')
    WHERE ability_reference_id IS NULL
       OR investment_request_id IS NULL
       OR issuer_entity_type IS NULL
       OR share_quantity IS NULL
       OR currency IS NULL
       OR origin IS NULL
  `;
  await sql`ALTER TABLE pending_investments ALTER COLUMN ability_reference_id SET NOT NULL`;
  await sql`ALTER TABLE pending_investments ALTER COLUMN investment_request_id SET NOT NULL`;
  await sql`ALTER TABLE pending_investments ALTER COLUMN share_quantity SET NOT NULL`;
  await sql`ALTER TABLE pending_investments ALTER COLUMN currency SET NOT NULL`;
  await sql`ALTER TABLE pending_investments ALTER COLUMN origin SET NOT NULL`;
  await sql`ALTER TABLE pending_investments DROP CONSTRAINT IF EXISTS pending_investments_issuer_entity_type_check`;
  await sql`ALTER TABLE pending_investments ADD CONSTRAINT pending_investments_issuer_entity_type_check CHECK (issuer_entity_type IN ('company','government'))`;
  await sql`ALTER TABLE pending_investments DROP CONSTRAINT IF EXISTS pending_investments_settlement_status_check`;
  await sql`ALTER TABLE pending_investments ADD CONSTRAINT pending_investments_settlement_status_check CHECK (settlement_status IN ('pending','settled','failed'))`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS pending_investments_ability_reference_id_idx ON pending_investments(ability_reference_id)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS pending_investments_investment_request_id_idx ON pending_investments(investment_request_id)`;
  await sql`CREATE INDEX IF NOT EXISTS pending_investments_settlement_status_idx ON pending_investments(settlement_status)`;

  await sql`DO $$ BEGIN CREATE TYPE entity_type_enum AS ENUM ('user','company','government','platform'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`;
  await sql`
    CREATE TABLE IF NOT EXISTS wallet_accounts (
      account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id UUID NOT NULL,
      entity_type entity_type_enum NOT NULL,
      account_type VARCHAR NOT NULL,
      currency VARCHAR NOT NULL DEFAULT 'USD',
      balance DECIMAL(18,2) NOT NULL DEFAULT 0,
      status VARCHAR NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS wallet_accounts_entity_account_unique_idx ON wallet_accounts(entity_id, entity_type, account_type)`;

  await sql`
    CREATE TABLE IF NOT EXISTS companies (
      company_id UUID PRIMARY KEY,
      company_name VARCHAR NOT NULL,
      registration_number VARCHAR,
      country VARCHAR,
      industry VARCHAR,
      wallet_account_id UUID REFERENCES wallet_accounts(account_id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS government_entities (
      entity_id UUID PRIMARY KEY,
      department_name VARCHAR NOT NULL,
      country VARCHAR,
      wallet_account_id UUID REFERENCES wallet_accounts(account_id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ledger_entries (
      entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id UUID NOT NULL,
      account_id UUID NOT NULL REFERENCES wallet_accounts(account_id),
      debit DECIMAL(18,2) NOT NULL DEFAULT 0,
      credit DECIMAL(18,2) NOT NULL DEFAULT 0,
      currency VARCHAR NOT NULL DEFAULT 'USD',
      reference_type VARCHAR NOT NULL,
      reference_id UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS investment_settlements (
      settlement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      investment_request_id UUID NOT NULL UNIQUE,
      pending_investment_id UUID NOT NULL REFERENCES pending_investments(id),
      investor_user_id UUID NOT NULL REFERENCES users(id),
      issuer_entity_type VARCHAR NOT NULL CHECK (issuer_entity_type IN ('company','government')),
      issuer_entity_id UUID NOT NULL,
      gross_amount NUMERIC(14,2) NOT NULL,
      fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      net_amount NUMERIC(14,2) NOT NULL,
      currency VARCHAR NOT NULL DEFAULT 'USD',
      status VARCHAR NOT NULL DEFAULT 'settled',
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS banks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      country TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (country, code)
    )
  `;

  await sql`
    CREATE OR REPLACE FUNCTION wallet_transfer_usd(
      sender_user UUID,
      recipient_user UUID,
      amt NUMERIC
    ) RETURNS VOID AS $$
    DECLARE
      n INT;
    BEGIN
      IF sender_user = recipient_user THEN
        RAISE EXCEPTION 'cannot_transfer_to_self';
      END IF;
      UPDATE wallets
      SET balance_usd = balance_usd - amt, updated_at = NOW()
      WHERE user_id = sender_user AND balance_usd >= amt;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n = 0 THEN
        RAISE EXCEPTION 'insufficient_or_missing_wallet';
      END IF;
      UPDATE wallets
      SET balance_usd = balance_usd + amt, updated_at = NOW()
      WHERE user_id = recipient_user;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n = 0 THEN
        RAISE EXCEPTION 'recipient_wallet_not_found';
      END IF;
    END;
    $$ LANGUAGE plpgsql
  `;

  await sql`
    INSERT INTO banks (country, name, code)
    VALUES
      ('Zimbabwe', 'AFC', 'AFC'),
      ('Zimbabwe', 'African Century Bank', 'ACB'),
      ('Zimbabwe', 'BancABC', 'BANCABC'),
      ('Zimbabwe', 'CABS', 'CABS'),
      ('Zimbabwe', 'CBZ Bank', 'CBZ'),
      ('Zimbabwe', 'Ecobank', 'ECO'),
      ('Zimbabwe', 'EmpowerBank', 'EMPOWER'),
      ('Zimbabwe', 'FBC Bank', 'FBC'),
      ('Zimbabwe', 'FBC Building Society', 'FBCBS'),
      ('Zimbabwe', 'First Capital Bank', 'FIRSTCAP'),
      ('Zimbabwe', 'GetBucks Microfinance Bank', 'GETBUCKS'),
      ('Zimbabwe', 'InnBucks Microbank', 'INNBUCKS'),
      ('Zimbabwe', 'Lion Microfinance Bank', 'LION'),
      ('Zimbabwe', 'Metbank', 'METBANK'),
      ('Zimbabwe', 'NBS', 'NBS'),
      ('Zimbabwe', 'Nedbank', 'NEDBANK'),
      ('Zimbabwe', 'NMB Bank', 'NMB'),
      ('Zimbabwe', 'POSB', 'POSB'),
      ('Zimbabwe', 'Stanbic Bank', 'STANBIC'),
      ('Zimbabwe', 'Success Microfinance Bank', 'SUCCESS'),
      ('Zimbabwe', 'TN Cybertech Bank', 'TNCYBER'),
      ('Zimbabwe', 'ZB Bank', 'ZB'),
      ('Zimbabwe', 'ZWMB', 'ZWMB'),
      ('Algeria', 'Banque Exterieure d''Algerie', 'BEA'),
      ('Angola', 'Banco Angolano de Investimentos', 'BAI'),
      ('Benin', 'Bank of Africa Benin', 'BOA-BJ'),
      ('Botswana', 'First National Bank Botswana', 'FNB-BW'),
      ('Burkina Faso', 'Coris Bank International Burkina Faso', 'CORIS-BF'),
      ('Burundi', 'Banque de Credit de Bujumbura', 'BCB-BI'),
      ('Cabo Verde', 'Caixa Economica de Cabo Verde', 'CECV'),
      ('Cameroon', 'Afriland First Bank Cameroon', 'AFRILAND-CM'),
      ('Central African Republic', 'Banque Populaire Maroco-Centrafricaine', 'BPMC-CF'),
      ('Chad', 'Banque Commerciale du Chari', 'BCC-TD'),
      ('Comoros', 'Exim Bank Comores', 'EXIM-KM'),
      ('Congo', 'BGFI Bank Congo', 'BGFI-CG'),
      ('Democratic Republic of the Congo', 'Rawbank', 'RAWBANK-CD'),
      ('Cote d''Ivoire', 'Societe Generale Cote d''Ivoire', 'SGCI-CI'),
      ('Djibouti', 'CAC International Bank', 'CAC-DJ'),
      ('Egypt', 'National Bank of Egypt', 'NBE-EG'),
      ('Equatorial Guinea', 'BANGE', 'BANGE-GQ'),
      ('Eritrea', 'Commercial Bank of Eritrea', 'CBE-ER'),
      ('Eswatini', 'First National Bank Eswatini', 'FNB-SZ'),
      ('Ethiopia', 'Commercial Bank of Ethiopia', 'CBE-ET'),
      ('Gabon', 'BGFI Bank Gabon', 'BGFI-GA'),
      ('Gambia', 'Trust Bank Gambia', 'TBG-GM'),
      ('Ghana', 'GCB Bank', 'GCB-GH'),
      ('Guinea', 'Ecobank Guinea', 'ECO-GN'),
      ('Guinea-Bissau', 'Banco da Africa Ocidental Guinea-Bissau', 'BAO-GW'),
      ('Kenya', 'KCB Bank Kenya', 'KCB-KE'),
      ('Lesotho', 'Standard Lesotho Bank', 'SLB-LS'),
      ('Liberia', 'Ecobank Liberia', 'ECO-LR'),
      ('Libya', 'Jumhouria Bank', 'JUM-LY'),
      ('Madagascar', 'Bank of Africa Madagascar', 'BOA-MG'),
      ('Malawi', 'National Bank of Malawi', 'NBM-MW'),
      ('Mali', 'Banque Malienne de Solidarite', 'BMS-ML'),
      ('Mauritania', 'Banque Populaire de Mauritanie', 'BPM-MR'),
      ('Mauritius', 'Mauritius Commercial Bank', 'MCB-MU'),
      ('Morocco', 'Attijariwafa Bank', 'ATTIJARI-MA'),
      ('Mozambique', 'Millennium BIM', 'BIM-MZ'),
      ('Namibia', 'Bank Windhoek', 'BW-NA'),
      ('Niger', 'Bank of Africa Niger', 'BOA-NE'),
      ('Nigeria', 'Access Bank Nigeria', 'ACCESS-NG'),
      ('Rwanda', 'Bank of Kigali', 'BOK-RW'),
      ('Sao Tome and Principe', 'Banco Internacional de Sao Tome e Principe', 'BISTP-ST'),
      ('Senegal', 'CBAO Senegal', 'CBAO-SN'),
      ('Seychelles', 'Nouvobanq Seychelles', 'NOUVO-SC'),
      ('Sierra Leone', 'Sierra Leone Commercial Bank', 'SLCB-SL'),
      ('Somalia', 'Premier Bank Somalia', 'PBS-SO'),
      ('South Africa', 'Standard Bank South Africa', 'SBSA-ZA'),
      ('South Sudan', 'Kenya Commercial Bank South Sudan', 'KCB-SS'),
      ('Sudan', 'Bank of Khartoum', 'BOK-SD'),
      ('Tanzania', 'CRDB Bank', 'CRDB-TZ'),
      ('Togo', 'Ecobank Togo', 'ECO-TG'),
      ('Tunisia', 'Banque Internationale Arabe de Tunisie', 'BIAT-TN'),
      ('Uganda', 'Stanbic Bank Uganda', 'STANBIC-UG'),
      ('Zambia', 'Zanaco', 'ZANACO-ZM'),
      ('United States', 'Chase', 'CHASE'),
      ('United States', 'Bank of America', 'BOA')
    ON CONFLICT (country, code) DO NOTHING
  `;

  await migrateLegacyUserProfilesTable();
  await migrateLegacyWalletsTable();
  await migrateLegacyUserSettingsTable();
  await migrateLegacyTransactionsTable();
  await migrateLegacyNotificationsTable();
  await migrateLegacyPendingInvestmentsTable();

  await sql`ALTER TABLE user_profiles ALTER COLUMN national_id DROP NOT NULL`;
  await sql`ALTER TABLE user_profiles ALTER COLUMN country DROP NOT NULL`;
}

/** Old DBs may have user_profiles(clerk_user_id, …). CREATE IF NOT EXISTS does not upgrade; replace with UUID FK model. */
async function migrateLegacyUserProfilesTable() {
  const [existsRow] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'user_profiles'
    ) AS e
  `;
  if (!(existsRow as { e: boolean }).e) return;

  const [colRow] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'user_id'
    ) AS e
  `;
  const hasUserId = (colRow as { e: boolean }).e;
  if (hasUserId) {
    const [typeRow] = await sql`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'user_id'
      LIMIT 1
    `;
    const type = String((typeRow as { data_type?: string } | undefined)?.data_type || '').toLowerCase();
    if (type === 'uuid') return;
  }

  await sql`DROP TABLE user_profiles CASCADE`;
  await sql`
    CREATE TABLE user_profiles (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      national_id TEXT UNIQUE,
      country TEXT,
      biometric_enabled BOOLEAN NOT NULL DEFAULT false,
      pin_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function migrateLegacyWalletsTable() {
  const [existsRow] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'wallets'
    ) AS e
  `;
  if (!(existsRow as { e: boolean }).e) return;
  const [colRow] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'wallets' AND column_name = 'user_id'
    ) AS e
  `;
  const hasUserId = (colRow as { e: boolean }).e;
  if (hasUserId) {
    const [typeRow] = await sql`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'wallets' AND column_name = 'user_id'
      LIMIT 1
    `;
    const type = String((typeRow as { data_type?: string } | undefined)?.data_type || '').toLowerCase();
    if (type === 'uuid') return;
  }

  await sql`DROP TABLE wallets CASCADE`;
  await sql`
    CREATE TABLE wallets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      balance_usd NUMERIC(14,2) NOT NULL DEFAULT 1000,
      wallet_type TEXT NOT NULL DEFAULT 'INDIVIDUAL',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function migrateLegacyUserSettingsTable() {
  const [existsRow] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'user_settings'
    ) AS e
  `;
  if (!(existsRow as { e: boolean }).e) return;
  const [colRow] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_settings' AND column_name = 'user_id'
    ) AS e
  `;
  const hasUserId = (colRow as { e: boolean }).e;
  if (hasUserId) {
    const [typeRow] = await sql`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_settings' AND column_name = 'user_id'
      LIMIT 1
    `;
    const type = String((typeRow as { data_type?: string } | undefined)?.data_type || '').toLowerCase();
    if (type === 'uuid') return;
  }

  await sql`DROP TABLE user_settings CASCADE`;
  await sql`
    CREATE TABLE user_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      currency TEXT NOT NULL DEFAULT 'USD',
      notifications_enabled BOOLEAN NOT NULL DEFAULT true,
      theme TEXT NOT NULL DEFAULT 'light',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function migrateLegacyTransactionsTable() {
  const [existsRow] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'transactions'
    ) AS e
  `;
  if (!(existsRow as { e: boolean }).e) return;

  const [colRow] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'user_id'
    ) AS e
  `;
  if ((colRow as { e: boolean }).e) return;

  await sql`DROP TABLE transactions CASCADE`;
  await sql`
    CREATE TABLE transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      transaction_type TEXT NOT NULL,
      amount_usd NUMERIC(14,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'CONFIRMED',
      description TEXT,
      sender_name TEXT,
      sender_phone TEXT,
      recipient_name TEXT,
      recipient_phone TEXT,
      company_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function migrateLegacyNotificationsTable() {
  const [existsRow] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'notifications'
    ) AS e
  `;
  if (!(existsRow as { e: boolean }).e) return;

  const [colRow] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'user_id'
    ) AS e
  `;
  if ((colRow as { e: boolean }).e) return;

  await sql`DROP TABLE notifications CASCADE`;
  await sql`
    CREATE TABLE notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function migrateLegacyPendingInvestmentsTable() {
  const [existsRow] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'pending_investments'
    ) AS e
  `;
  if (!(existsRow as { e: boolean }).e) return;

  const [colRow] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pending_investments' AND column_name = 'user_id'
    ) AS e
  `;
  if ((colRow as { e: boolean }).e) return;

  await sql`DROP TABLE pending_investments CASCADE`;
  await sql`
    CREATE TABLE pending_investments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_name TEXT NOT NULL,
      price_per_share NUMERIC(14,2) NOT NULL,
      number_of_shares INT NOT NULL,
      total_amount NUMERIC(14,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

app.get('/health', async (_req, res) => {
  try {
    await sql`SELECT 1 AS ok`;
    res.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
      stack: 'express+jwt+neon',
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'error',
      database: 'unreachable',
      error: error?.message || 'Database check failed',
    });
  }
});

/** One statement = atomic signup (avoids orphan users row if profile/wallet steps fail). */
async function insertUserWithSatellites(
  emailTrim: string,
  phoneTrim: string,
  password_hash: string,
  fullNameTrim: string,
  walletClass: WalletClass = 'investor'
): Promise<string> {
  const rows = await sql`
    WITH u AS (
      INSERT INTO users (email, phone, password_hash)
      VALUES (${emailTrim}, ${phoneTrim}, ${password_hash})
      RETURNING id
    ),
    _p AS (
      INSERT INTO user_profiles (user_id, full_name, wallet_class)
      SELECT id, ${fullNameTrim}, ${walletClass} FROM u
    ),
    _w AS (
      INSERT INTO wallets (user_id, balance_usd, wallet_type)
      SELECT id, 1000, ${walletClass} FROM u
    ),
    _s AS (
      INSERT INTO user_settings (user_id)
      SELECT id FROM u
    )
    SELECT id::text AS id FROM u
  `;
  const id = (rows[0] as { id: string } | undefined)?.id;
  if (!id) {
    throw new Error('Registration insert returned no user id.');
  }
  return id;
}

/**
 * Prior signup may have created only `users` (old non-atomic flow) or the app never saved the token.
 * If password matches, ensure profile/wallet/settings and return a session.
 */
async function tryResumeSignup(
  emailTrim: string,
  phoneTrim: string,
  password: string,
  fullNameTrim: string,
  walletClass: WalletClass = 'investor'
): Promise<
  { ok: true; userId: string; email: string; full_name: string } | { ok: false; message: string }
> {
  const [row] = await sql`
    SELECT id, password_hash, email FROM users
    WHERE email = ${emailTrim} OR phone = ${phoneTrim}
    LIMIT 1
  `;
  const r = row as { id: string; password_hash: string; email: string } | undefined;
  if (!r) {
    return { ok: false, message: 'An account with this email or phone already exists.' };
  }
  if (!(await bcrypt.compare(password, r.password_hash))) {
    return {
      ok: false,
      message:
        'An account with this email or phone already exists. Log in with your password, or use a different email or phone.',
    };
  }
  await sql`
    INSERT INTO user_profiles (user_id, full_name, wallet_class)
    VALUES (${r.id}::uuid, ${fullNameTrim}, ${walletClass})
    ON CONFLICT (user_id)
    DO UPDATE SET wallet_class = EXCLUDED.wallet_class
  `;
  await sql`
    INSERT INTO wallets (user_id, balance_usd, wallet_type) VALUES (${r.id}::uuid, 1000, ${walletClass})
    ON CONFLICT (user_id)
    DO UPDATE SET wallet_type = EXCLUDED.wallet_type
  `;
  await sql`
    INSERT INTO user_settings (user_id) VALUES (${r.id}::uuid)
    ON CONFLICT (user_id) DO NOTHING
  `;
  const [prof] = await sql`
    SELECT full_name FROM user_profiles WHERE user_id = ${r.id}::uuid LIMIT 1
  `;
  const fn = (prof as { full_name: string } | undefined)?.full_name?.trim() || fullNameTrim;
  return { ok: true, userId: r.id, email: r.email, full_name: fn };
}

async function upsertWalletClassArtifacts(
  userId: string,
  walletClass: WalletClass,
  data: Record<string, unknown>
) {
  await sql`
    UPDATE user_profiles
    SET wallet_class = ${walletClass}, updated_at = NOW()
    WHERE user_id = ${userId}::uuid
  `;
  await sql`
    UPDATE wallets
    SET wallet_type = ${walletClass}, updated_at = NOW()
    WHERE user_id = ${userId}::uuid
  `;

  if (walletClass === 'issuer_company') {
    const companyId = isUuid(data.company_id) ? (data.company_id as string) : randomUUID();
    const issuerName = String(data.issuer_name || data.company_name || 'Company Issuer').trim();
    const wallet = await getOrCreateCompanyWalletAccount(companyId);
    await sql`
      INSERT INTO companies (
        company_id, company_name, registration_number, country, industry, wallet_account_id
      )
      VALUES (
        ${companyId}::uuid,
        ${issuerName},
        ${typeof data.registration_number === 'string' ? data.registration_number.trim() : null},
        ${typeof data.country === 'string' ? data.country.trim() : null},
        ${typeof data.industry === 'string' ? data.industry.trim() : null},
        ${wallet.account_id}::uuid
      )
      ON CONFLICT (company_id)
      DO UPDATE SET
        company_name = EXCLUDED.company_name,
        registration_number = EXCLUDED.registration_number,
        country = EXCLUDED.country,
        industry = EXCLUDED.industry,
        wallet_account_id = EXCLUDED.wallet_account_id
    `;
    await sql`
      INSERT INTO issuer_wallet_profiles (user_id, issuer_kind, issuer_name, company_id, government_entity_id, updated_at)
      VALUES (${userId}::uuid, 'company', ${issuerName}, ${companyId}::uuid, NULL, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        issuer_kind = EXCLUDED.issuer_kind,
        issuer_name = EXCLUDED.issuer_name,
        company_id = EXCLUDED.company_id,
        government_entity_id = EXCLUDED.government_entity_id,
        updated_at = NOW()
    `;
    await sql`DELETE FROM business_wallet_profiles WHERE user_id = ${userId}::uuid`;
    return;
  }

  if (walletClass === 'issuer_government') {
    const entityId = isUuid(data.government_entity_id) ? (data.government_entity_id as string) : randomUUID();
    const issuerName = String(data.issuer_name || data.department_name || 'Government Issuer').trim();
    const wallet = await getOrCreateGovernmentWalletAccount(entityId);
    await sql`
      INSERT INTO government_entities (
        entity_id, department_name, country, wallet_account_id
      )
      VALUES (
        ${entityId}::uuid,
        ${issuerName},
        ${typeof data.country === 'string' ? data.country.trim() : null},
        ${wallet.account_id}::uuid
      )
      ON CONFLICT (entity_id)
      DO UPDATE SET
        department_name = EXCLUDED.department_name,
        country = EXCLUDED.country,
        wallet_account_id = EXCLUDED.wallet_account_id
    `;
    await sql`
      INSERT INTO issuer_wallet_profiles (user_id, issuer_kind, issuer_name, company_id, government_entity_id, updated_at)
      VALUES (${userId}::uuid, 'government', ${issuerName}, NULL, ${entityId}::uuid, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        issuer_kind = EXCLUDED.issuer_kind,
        issuer_name = EXCLUDED.issuer_name,
        company_id = EXCLUDED.company_id,
        government_entity_id = EXCLUDED.government_entity_id,
        updated_at = NOW()
    `;
    await sql`DELETE FROM business_wallet_profiles WHERE user_id = ${userId}::uuid`;
    return;
  }

  if (walletClass === 'business_vendor' || walletClass === 'business_contractor') {
    const businessType = walletClass === 'business_vendor' ? 'vendor' : 'contractor';
    const businessName = String(data.business_name || data.full_name || 'Business Wallet Holder').trim();
    await sql`
      INSERT INTO business_wallet_profiles (user_id, business_type, business_name, linked_issuer_user_id, updated_at)
      VALUES (
        ${userId}::uuid,
        ${businessType},
        ${businessName},
        ${isUuid(data.linked_issuer_user_id) ? (data.linked_issuer_user_id as string) : null}::uuid,
        NOW()
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        business_type = EXCLUDED.business_type,
        business_name = EXCLUDED.business_name,
        linked_issuer_user_id = EXCLUDED.linked_issuer_user_id,
        updated_at = NOW()
    `;
    await sql`DELETE FROM issuer_wallet_profiles WHERE user_id = ${userId}::uuid`;
    return;
  }

  await sql`DELETE FROM issuer_wallet_profiles WHERE user_id = ${userId}::uuid`;
  await sql`DELETE FROM business_wallet_profiles WHERE user_id = ${userId}::uuid`;
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, phone, password, wallet_class } = req.body ?? {};
    if (wallet_class && normalizeWalletClass(wallet_class, 'investor') !== 'investor') {
      return res.status(403).json({
        error:
          'Public signup is limited to Investor Wallets. Issuer and Business wallets must be provisioned by an admin.',
      });
    }
    const fullNameTrim = typeof fullName === 'string' ? fullName.trim() : '';
    const emailTrim = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const phoneTrim = typeof phone === 'string' ? phone.trim() : '';

    if (!fullNameTrim || !emailTrim || !phoneTrim || !password) {
      return res.status(400).json({ error: 'Full name, email, phone, and password are required.' });
    }

    const pwdErr = validateSignupPassword(password);
    if (pwdErr) {
      return res.status(400).json({ error: pwdErr });
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    try {
      const userId = await insertUserWithSatellites(emailTrim, phoneTrim, password_hash, fullNameTrim, 'investor');
      const token = signAccessToken(userId);
      return res.status(201).json({
        token,
        user: { id: userId, email: emailTrim, full_name: fullNameTrim, wallet_class: 'investor' },
      });
    } catch (first: any) {
      if (first?.code !== '23505') {
        throw first;
      }
      const resumed = await tryResumeSignup(emailTrim, phoneTrim, password, fullNameTrim, 'investor');
      if (resumed.ok) {
        const token = signAccessToken(resumed.userId);
        return res.status(200).json({
          token,
          user: {
            id: resumed.userId,
            email: resumed.email,
            full_name: resumed.full_name,
            wallet_class: 'investor',
          },
          resumed: true,
        });
      }
      return res.status(409).json({ error: resumed.message });
    }
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'An account with this email or phone already exists.' });
    }
    return res.status(500).json({ error: error.message || 'Registration failed.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body ?? {};
    const phoneTrim = typeof phone === 'string' ? phone.trim() : '';

    if (!phoneTrim || !password) {
      return res.status(400).json({ error: 'Phone and password are required.' });
    }

    const [row] = await sql`
      SELECT u.id, u.email, u.password_hash, up.full_name, up.wallet_class
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE u.phone = ${phoneTrim}
      LIMIT 1
    `;
    const r = row as
      | { id: string; email: string; password_hash: string; full_name: string | null; wallet_class: string | null }
      | undefined;
    if (!r || !(await bcrypt.compare(password, r.password_hash))) {
      return res.status(401).json({ error: 'Invalid phone or password.' });
    }

    const token = signAccessToken(r.id);
    const full_name = typeof r.full_name === 'string' ? r.full_name.trim() : '';
    return res.json({
      token,
      user: {
        id: r.id,
        email: r.email,
        full_name: full_name || null,
        wallet_class: normalizeWalletClass(r.wallet_class, 'investor'),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Login failed.' });
  }
});

app.get('/api/me', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [profileRow] = await sql`
      SELECT
        up.user_id AS id,
        up.full_name,
        up.wallet_class,
        u.phone,
        u.email,
        up.country,
        up.national_id,
        up.biometric_enabled,
        up.pin_hash
      FROM user_profiles up
      JOIN users u ON u.id = up.user_id
      WHERE up.user_id = ${userId}
      LIMIT 1
    `;

    let profile: Record<string, unknown> | null = null;
    let walletClass: WalletClass = 'investor';
    let kyc_complete = false;
    if (profileRow) {
      const { pin_hash: _ph, ...rest } = profileRow as Record<string, unknown> & { pin_hash?: string | null };
      walletClass = normalizeWalletClass(rest.wallet_class, 'investor');
      kyc_complete = isKycCompleteRow({
        country: rest.country as string | null,
        national_id: rest.national_id as string | null,
        pin_hash: (profileRow as { pin_hash?: string | null }).pin_hash ?? null,
      });
      profile = { ...rest, kyc_complete, pin_set: Boolean((profileRow as { pin_hash?: string | null }).pin_hash) };
    }
    const [wallet] = await sql`
      SELECT id, balance_usd
      FROM wallets
      WHERE user_id = ${userId}
      LIMIT 1
    `;
    const [settings] = await sql`
      SELECT currency, notifications_enabled, theme
      FROM user_settings
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    const [issuerProfile] = await sql`
      SELECT issuer_kind, issuer_name, company_id, government_entity_id
      FROM issuer_wallet_profiles
      WHERE user_id = ${userId}::uuid
      LIMIT 1
    `;
    const [businessProfile] = await sql`
      SELECT business_type, business_name, linked_issuer_user_id
      FROM business_wallet_profiles
      WHERE user_id = ${userId}::uuid
      LIMIT 1
    `;

    return res.json({
      wallet_class: walletClass,
      kyc_complete,
      profile: profile ?? null,
      wallet: wallet ?? { balance_usd: '0.00' },
      issuer_profile: issuerProfile ?? null,
      business_profile: businessProfile ?? null,
      settings: settings ?? { currency: 'USD', notifications_enabled: true, theme: 'auto' },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to load user data.' });
  }
});

app.get('/api/profile/lookup', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!(await assertKycComplete(userId, res))) return;

    const phone = String(req.query.phone || '').trim();
    if (!phone) {
      return res.status(400).json({ error: 'Missing phone query parameter.' });
    }

    const [row] = await sql`
      SELECT up.user_id AS id, up.full_name, up.country, u.phone
      FROM users u
      JOIN user_profiles up ON up.user_id = u.id
      WHERE u.phone = ${phone}
      LIMIT 1
    `;

    return res.json({ profile: row ?? null });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Lookup failed.' });
  }
});

app.get('/api/transactions', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!(await assertKycComplete(userId, res))) return;

    const rows = await sql`
      SELECT id, transaction_type, amount_usd::text AS amount_usd, status, created_at,
             description, sender_name, sender_phone, recipient_name, recipient_phone, company_name
      FROM transactions
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 200
    `;

    return res.json({ transactions: rows });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to load transactions.' });
  }
});

app.get('/api/notifications', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!(await assertKycComplete(userId, res))) return;

    const rows = await sql`
      SELECT id, type, title, message, is_read AS read, created_at
      FROM notifications
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 50
    `;

    return res.json({ notifications: rows });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to load notifications.' });
  }
});

app.patch('/api/notifications/:id/read', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!(await assertKycComplete(userId, res))) return;
    const { id } = req.params;

    await sql`
      UPDATE notifications
      SET is_read = true
      WHERE id = ${id}::uuid AND user_id = ${userId}
    `;

    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to update notification.' });
  }
});

app.get('/api/banks', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!(await assertKycComplete(userId, res))) return;

    const country = String(req.query.country || '').trim();
    if (!country) {
      return res.status(400).json({ error: 'Missing country query parameter.' });
    }

    const rows = await sql`
      SELECT id, name, code, country
      FROM banks
      WHERE country = ${country}
      ORDER BY name
    `;

    return res.json({ banks: rows });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to load banks.' });
  }
});

app.get('/api/pending-investments', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!(await assertWalletClass(userId, ['investor'], res))) return;
    if (!(await assertKycComplete(userId, res))) return;

    const rows = await sql`
      SELECT
        COALESCE(ability_reference_id, id) AS id,
        company_name,
        price_per_share::text AS price_per_share,
        COALESCE(share_quantity, number_of_shares) AS number_of_shares,
        total_amount::text AS total_amount,
        status,
        created_at::text AS created_at
      FROM pending_investments
      WHERE user_id = ${userId}
        AND status IN ('PENDING', 'pending_authorization')
      ORDER BY created_at DESC
    `;

    return res.json({ investments: rows });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to load investments.' });
  }
});

app.post('/api/investments/request', async (req, res) => {
  try {
    const key = String(req.headers['x-privateex-key'] || '');
    if (PRIVATEEX_API_KEY && key !== PRIVATEEX_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized integration request.' });
    }
    const {
      investment_request_id,
      user_id,
      company_id,
      issuer_type,
      issuer_entity_id,
      share_quantity,
      total_amount,
      currency,
      origin,
    } = req.body ?? {};
    const issuerEntityType = normalizeIssuerEntityType(issuer_type);
    const resolvedIssuerEntityId = issuerEntityIdOrLegacy(
      issuer_entity_id,
      company_id,
      issuerEntityType
    );

    if (
      !isUuid(investment_request_id) ||
      !isUuid(user_id) ||
      !isUuid(resolvedIssuerEntityId) ||
      !Number.isInteger(Number(share_quantity)) ||
      Number(share_quantity) <= 0
    ) {
      return res.status(400).json({ error: 'Invalid request payload.' });
    }
    const amount = Number(total_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid total_amount.' });
    }
    const ccy = String(currency || 'USD').trim().toUpperCase();
    const orig = String(origin || 'privateex').trim().toLowerCase();

    let issuerName = 'PrivateEx Issuer';
    if (issuerEntityType === 'government') {
      const [government] = await sql`
        SELECT department_name
        FROM government_entities
        WHERE entity_id = ${resolvedIssuerEntityId}::uuid
        LIMIT 1
      `;
      issuerName = (government as { department_name?: string } | undefined)?.department_name || issuerName;
    } else {
      const [company] = await sql`
        SELECT company_name
        FROM companies
        WHERE company_id = ${resolvedIssuerEntityId}::uuid
        LIMIT 1
      `;
      issuerName = (company as { company_name?: string } | undefined)?.company_name || issuerName;
    }
    const [targetUser] = await sql`
      SELECT wallet_class
      FROM user_profiles
      WHERE user_id = ${user_id}::uuid
      LIMIT 1
    `;
    if (normalizeWalletClass((targetUser as { wallet_class?: string } | undefined)?.wallet_class, 'investor') !== 'investor') {
      return res.status(400).json({ error: 'Investment requests can only target Investor Wallet holders.' });
    }

    const [inserted] = await sql`
      INSERT INTO pending_investments (
        id,
        ability_reference_id,
        investment_request_id,
        user_id,
        company_id,
        issuer_entity_type,
        issuer_entity_id,
        company_name,
        number_of_shares,
        share_quantity,
        total_amount,
        price_per_share,
        currency,
        status,
        settlement_status,
        origin
      )
      VALUES (
        ${investment_request_id}::uuid,
        ${investment_request_id}::uuid,
        ${investment_request_id}::uuid,
        ${user_id}::uuid,
        ${issuerEntityType === 'company' ? resolvedIssuerEntityId : null}::uuid,
        ${issuerEntityType},
        ${resolvedIssuerEntityId}::uuid,
        ${issuerName},
        ${Number(share_quantity)},
        ${Number(share_quantity)},
        ${amount.toFixed(2)}::numeric,
        ${(amount / Number(share_quantity)).toFixed(2)}::numeric,
        ${ccy},
        'pending_authorization',
        'pending',
        ${orig}
      )
      ON CONFLICT (investment_request_id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        company_id = EXCLUDED.company_id,
        issuer_entity_type = EXCLUDED.issuer_entity_type,
        issuer_entity_id = EXCLUDED.issuer_entity_id,
        company_name = EXCLUDED.company_name,
        number_of_shares = EXCLUDED.number_of_shares,
        share_quantity = EXCLUDED.share_quantity,
        total_amount = EXCLUDED.total_amount,
        price_per_share = EXCLUDED.price_per_share,
        currency = EXCLUDED.currency,
        settlement_status = 'pending',
        origin = EXCLUDED.origin
      RETURNING ability_reference_id
    `;

    return res.json({
      status: 'pending_authorization',
      ability_reference_id: (inserted as { ability_reference_id: string }).ability_reference_id,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to create pending investment.' });
  }
});

app.post('/api/admin/companies/upsert', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId || !isAdmin(userId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const { company_id, company_name, registration_number, country, industry } = req.body ?? {};
    if (!isUuid(company_id) || typeof company_name !== 'string' || !company_name.trim()) {
      return res.status(400).json({ error: 'company_id and company_name are required.' });
    }
    const wallet = await getOrCreateCompanyWalletAccount(company_id);
    await sql`
      INSERT INTO companies (
        company_id, company_name, registration_number, country, industry, wallet_account_id
      )
      VALUES (
        ${company_id}::uuid,
        ${company_name.trim()},
        ${typeof registration_number === 'string' ? registration_number.trim() : null},
        ${typeof country === 'string' ? country.trim() : null},
        ${typeof industry === 'string' ? industry.trim() : null},
        ${wallet.account_id}::uuid
      )
      ON CONFLICT (company_id)
      DO UPDATE SET
        company_name = EXCLUDED.company_name,
        registration_number = EXCLUDED.registration_number,
        country = EXCLUDED.country,
        industry = EXCLUDED.industry,
        wallet_account_id = EXCLUDED.wallet_account_id
    `;
    return res.json({ ok: true, company_id, wallet_account_id: wallet.account_id });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to upsert company.' });
  }
});

app.post('/api/admin/government-entities/upsert', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId || !isAdmin(userId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const { entity_id, department_name, country } = req.body ?? {};
    if (!isUuid(entity_id) || typeof department_name !== 'string' || !department_name.trim()) {
      return res.status(400).json({ error: 'entity_id and department_name are required.' });
    }
    const wallet = await getOrCreateGovernmentWalletAccount(entity_id);
    await sql`
      INSERT INTO government_entities (
        entity_id, department_name, country, wallet_account_id
      )
      VALUES (
        ${entity_id}::uuid,
        ${department_name.trim()},
        ${typeof country === 'string' ? country.trim() : null},
        ${wallet.account_id}::uuid
      )
      ON CONFLICT (entity_id)
      DO UPDATE SET
        department_name = EXCLUDED.department_name,
        country = EXCLUDED.country,
        wallet_account_id = EXCLUDED.wallet_account_id
    `;
    return res.json({ ok: true, entity_id, wallet_account_id: wallet.account_id });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to upsert government entity.' });
  }
});

app.get('/api/admin/settlements/:investmentRequestId', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId || !isAdmin(userId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const { investmentRequestId } = req.params;
    if (!isUuid(investmentRequestId)) {
      return res.status(400).json({ error: 'Invalid investmentRequestId.' });
    }
    const [row] = await sql`
      SELECT
        settlement_id,
        investment_request_id,
        pending_investment_id,
        investor_user_id,
        issuer_entity_type,
        issuer_entity_id,
        gross_amount::text AS gross_amount,
        fee_amount::text AS fee_amount,
        net_amount::text AS net_amount,
        currency,
        status,
        processed_at::text AS processed_at,
        created_at::text AS created_at
      FROM investment_settlements
      WHERE investment_request_id = ${investmentRequestId}::uuid
      LIMIT 1
    `;
    if (!row) {
      return res.status(404).json({ error: 'Settlement not found.' });
    }
    return res.json({ settlement: row });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to load settlement.' });
  }
});

app.post('/api/admin/wallet-holders/upsert', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId || !isAdmin(userId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const walletClass = normalizeWalletClass(body.wallet_class, 'investor');
    let targetUserId = isUuid(body.user_id) ? (body.user_id as string) : null;

    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!targetUserId) {
      if (!fullName || !email || !phone || !password) {
        return res.status(400).json({
          error:
            'For new wallet holder creation, full_name, email, phone, and password are required.',
        });
      }
      const pwdErr = validateSignupPassword(password);
      if (pwdErr) {
        return res.status(400).json({ error: pwdErr });
      }
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      targetUserId = await insertUserWithSatellites(email, phone, passwordHash, fullName, walletClass);
    } else {
      const [existing] = await sql`
        SELECT id
        FROM users
        WHERE id = ${targetUserId}::uuid
        LIMIT 1
      `;
      if (!existing) {
        return res.status(404).json({ error: 'Target user not found.' });
      }
      if (fullName) {
        await sql`
          UPDATE user_profiles
          SET full_name = ${fullName}, updated_at = NOW()
          WHERE user_id = ${targetUserId}::uuid
        `;
      }
    }

    await upsertWalletClassArtifacts(targetUserId, walletClass, body);

    return res.json({ ok: true, user_id: targetUserId, wallet_class: walletClass });
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'A conflicting wallet holder record already exists.' });
    }
    return res.status(500).json({ error: error.message || 'Failed to upsert wallet holder.' });
  }
});

app.post('/api/pending-investments/:id/authorize', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!(await assertWalletClass(userId, ['investor'], res))) return;
    const { pin } = req.body ?? {};
    if (!(await assertKycAndTransactionPin(userId, pin, res))) return;
    const { id } = req.params;

    const [inv] = await sql`
      SELECT
        id,
        ability_reference_id,
        investment_request_id,
        company_id,
        issuer_entity_type,
        issuer_entity_id,
        company_name,
        total_amount::text AS total_amount,
        COALESCE(currency, 'USD') AS currency
      FROM pending_investments
      WHERE (id = ${id}::uuid OR ability_reference_id = ${id}::uuid OR investment_request_id = ${id}::uuid)
        AND user_id = ${userId}
        AND status IN ('PENDING', 'pending_authorization')
      LIMIT 1
    `;

    if (!inv) {
      const [existing] = await sql`
        SELECT id
        FROM pending_investments
        WHERE (id = ${id}::uuid OR ability_reference_id = ${id}::uuid OR investment_request_id = ${id}::uuid)
          AND user_id = ${userId}
          AND status = 'authorized'
        LIMIT 1
      `;
      if (existing) {
        return res.json({ ok: true, idempotent: true });
      }
      return res.status(404).json({ error: 'Investment not found.' });
    }

    const issuerEntityId =
      ((inv as { issuer_entity_id?: string }).issuer_entity_id as string) ||
      ((inv as { company_id?: string }).company_id as string);
    if (!isUuid(issuerEntityId)) {
      return res.status(400).json({ error: 'Issuer wallet target is not configured on this investment.' });
    }

    let settlement: {
      gross_amount: string;
      fee_amount: string;
      net_amount: string;
      currency: string;
    };
    try {
      settlement = await processInvestmentSettlement({
      investment_id: (inv as { id: string }).id,
      investment_request_id:
        (inv as { investment_request_id?: string; id: string }).investment_request_id ||
        (inv as { id: string }).id,
      investor_user_id: userId!,
      issuer_entity_type: normalizeIssuerEntityType(
        (inv as { issuer_entity_type?: string }).issuer_entity_type
      ),
      issuer_entity_id: issuerEntityId,
      issuer_name: (inv as { company_name?: string }).company_name || 'Issuer',
      total_amount: (inv as { total_amount: string }).total_amount,
      currency: String((inv as { currency?: string }).currency || 'USD'),
    });
    } catch (settleErr: any) {
      const message = String(settleErr?.message || 'Settlement failed.');
      if (
        message.includes('Insufficient balance') ||
        message.includes('not configured') ||
        message.includes('Invalid settlement amount') ||
        message.includes('negative')
      ) {
        return res.status(400).json({ error: message });
      }
      throw settleErr;
    }

    const refId = (inv as { investment_request_id?: string; id: string }).investment_request_id || (inv as { id: string }).id;
    void sendPrivateExWebhook({
      investment_request_id: refId,
      ability_reference_id: refId,
      status: 'authorized',
      fee_amount: settlement.fee_amount,
      net_amount: settlement.net_amount,
      timestamp: new Date().toISOString(),
    });

    return res.json({ ok: true, settlement });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Authorization failed.' });
  }
});

async function declinePendingInvestmentHandler(req: express.Request, res: express.Response) {
  try {
    const { userId } = getAuth(req);
    if (!(await assertWalletClass(userId, ['investor'], res))) return;
    const { pin } = req.body ?? {};
    if (!(await assertKycAndTransactionPin(userId, pin, res))) return;
    const { id } = req.params;

    const [inv] = await sql`
      UPDATE pending_investments
      SET status = 'rejected', settlement_status = 'failed'
      WHERE (id = ${id}::uuid OR ability_reference_id = ${id}::uuid OR investment_request_id = ${id}::uuid)
        AND user_id = ${userId}
        AND status IN ('PENDING', 'pending_authorization')
      RETURNING id, investment_request_id
    `;
    if (!inv) {
      return res.status(404).json({ error: 'Investment not found.' });
    }
    const refId = (inv as { investment_request_id?: string; id: string }).investment_request_id || (inv as { id: string }).id;
    void sendPrivateExWebhook({
      investment_request_id: refId,
      ability_reference_id: refId,
      status: 'rejected',
      timestamp: new Date().toISOString(),
    });

    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Decline failed.' });
  }
}

app.post('/api/pending-investments/:id/decline', requireAuth(), declinePendingInvestmentHandler);
// Backward compatible alias
app.post('/api/pending-investments/:id/cancel', requireAuth(), declinePendingInvestmentHandler);

app.post('/api/wallet/withdraw', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { amountUsd, description, pin } = req.body ?? {};
    if (!(await assertKycAndTransactionPin(userId, pin, res))) return;

    const amt = Number(amountUsd);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Invalid amount.' });
    }

    const [w] = await sql`
      SELECT balance_usd::text AS balance_usd
      FROM wallets WHERE user_id = ${userId} LIMIT 1
    `;
    if (!w || Number(w.balance_usd) < amt) {
      return res.status(400).json({ error: 'Insufficient balance.' });
    }

    const newBal = (Number(w.balance_usd) - amt).toFixed(2);
    await sql`
      UPDATE wallets SET balance_usd = ${newBal}::numeric, updated_at = NOW()
      WHERE user_id = ${userId}
    `;
    await sql`
      INSERT INTO transactions (user_id, transaction_type, amount_usd, status, description)
      VALUES (${userId}, 'WITHDRAW', ${amt.toFixed(2)}::numeric, 'PENDING', ${description ?? null})
    `;

    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Withdrawal failed.' });
  }
});

app.post('/api/wallet/xchange', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { recipientPhone, amountUsd, pin } = req.body ?? {};
    if (!(await assertKycAndTransactionPin(userId, pin, res))) return;

    const amt = Number(amountUsd);
    if (!recipientPhone || typeof recipientPhone !== 'string') {
      return res.status(400).json({ error: 'Missing recipient phone.' });
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Invalid amount.' });
    }

    const [recipient] = await sql`
      SELECT u.id AS user_id, up.full_name, u.phone
      FROM users u
      JOIN user_profiles up ON up.user_id = u.id
      WHERE u.phone = ${recipientPhone.trim()}
      LIMIT 1
    `;
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found.' });
    }
    const rid = (recipient as { user_id: string }).user_id;
    const [sender] = await sql`
      SELECT up.full_name, u.phone, up.country
      FROM users u
      JOIN user_profiles up ON up.user_id = u.id
      WHERE u.id = ${userId}
      LIMIT 1
    `;

    if (rid === userId) {
      return res.status(400).json({ error: 'Cannot transfer to yourself.' });
    }

    try {
      await sql`SELECT wallet_transfer_usd(${userId}::uuid, ${rid}::uuid, ${amt.toFixed(2)}::numeric)`;
    } catch (e: any) {
      const msg = String(e.message || e);
      if (msg.includes('insufficient_or_missing_wallet')) {
        return res.status(400).json({ error: 'Insufficient balance.' });
      }
      if (msg.includes('recipient_wallet_not_found')) {
        return res.status(400).json({ error: 'Recipient wallet not found.' });
      }
      throw e;
    }

    await sql`
      INSERT INTO transactions (
        user_id,
        transaction_type,
        amount_usd,
        status,
        sender_name,
        sender_phone,
        recipient_name,
        recipient_phone,
        description
      )
      VALUES (
        ${userId},
        'XCHANGE',
        ${amt.toFixed(2)}::numeric,
        'CONFIRMED',
        ${(sender as { full_name?: string } | undefined)?.full_name ?? 'Sender'},
        ${(sender as { phone?: string } | undefined)?.phone ?? null},
        ${(recipient as { full_name?: string }).full_name ?? 'Recipient'},
        ${(recipient as { phone?: string }).phone ?? recipientPhone.trim()},
        ${`Transfer to ${(recipient as { full_name?: string }).full_name ?? 'recipient'}`}
      )
    `;
    await sql`
      INSERT INTO transactions (
        user_id,
        transaction_type,
        amount_usd,
        status,
        sender_name,
        sender_phone,
        recipient_name,
        recipient_phone,
        description
      )
      VALUES (
        ${rid},
        'RECEIVE',
        ${amt.toFixed(2)}::numeric,
        'CONFIRMED',
        ${(sender as { full_name?: string } | undefined)?.full_name ?? 'Sender'},
        ${(sender as { phone?: string } | undefined)?.phone ?? null},
        ${(recipient as { full_name?: string }).full_name ?? 'Recipient'},
        ${(recipient as { phone?: string }).phone ?? recipientPhone.trim()},
        ${`Received from ${(sender as { full_name?: string } | undefined)?.full_name ?? 'sender'}`}
      )
    `;

    await sql`
      INSERT INTO notifications (user_id, type, title, message)
      VALUES (
        ${rid},
        'transaction',
        'Capital received',
        ${`You received $${amt.toFixed(2)} from ${((sender as { full_name?: string } | undefined)?.full_name ?? 'a sender')} (${((sender as { phone?: string } | undefined)?.phone ?? 'phone unavailable')}). Country: ${((sender as { country?: string } | undefined)?.country ?? 'Unknown')}. Ref: sender ${userId}, recipient ${rid}.`}
      )
    `;

    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Transfer failed.' });
  }
});

app.patch('/api/me/settings', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { notificationsEnabled, theme } = req.body ?? {};

    await sql`
      UPDATE user_settings
      SET
        notifications_enabled = COALESCE(${notificationsEnabled}, notifications_enabled),
        theme = COALESCE(${theme}, theme),
        updated_at = NOW()
      WHERE user_id = ${userId}
    `;

    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to update settings.' });
  }
});

app.patch('/api/me/biometric', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { biometricEnabled } = req.body ?? {};

    await sql`
      UPDATE user_profiles
      SET
        biometric_enabled = COALESCE(${biometricEnabled}, biometric_enabled),
        updated_at = NOW()
      WHERE user_id = ${userId}
    `;

    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to update biometric setting.' });
  }
});

app.patch('/api/me/kyc', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { country, nationalId, pin, confirmPin } = req.body ?? {};
    const countryTrim = typeof country === 'string' ? country.trim() : '';
    const nationalTrim = typeof nationalId === 'string' ? nationalId.trim() : '';
    const pinStr = typeof pin === 'string' ? pin.trim() : '';

    if (!countryTrim || !nationalTrim) {
      return res.status(400).json({ error: 'Country and national ID or passport number are required.' });
    }
    if (!/^\d{6}$/.test(pinStr)) {
      return res.status(400).json({ error: 'Transaction PIN must be exactly 6 digits.' });
    }
    const confirmTrim = typeof confirmPin === 'string' ? confirmPin.trim() : '';
    if (confirmTrim !== pinStr) {
      return res.status(400).json({ error: 'PIN confirmation does not match.' });
    }

    const pin_hash = await bcrypt.hash(pinStr, BCRYPT_ROUNDS);

    // Legacy / partial data: user without user_profiles row would make UPDATE match 0 rows.
    await sql`
      INSERT INTO user_profiles (user_id, full_name)
      VALUES (${userId}::uuid, 'Member')
      ON CONFLICT (user_id) DO NOTHING
    `;

    const updated = await sql`
      UPDATE user_profiles
      SET
        country = ${countryTrim},
        national_id = ${nationalTrim},
        pin_hash = ${pin_hash},
        updated_at = NOW()
      WHERE user_id = ${userId}::uuid
      RETURNING user_id
    `;

    if (!updated.length) {
      return res.status(404).json({ error: 'Profile not found.' });
    }

    return res.json({ ok: true });
  } catch (error: any) {
    const msg = String(error?.message ?? error);
    const code = error?.code;
    if (code === '23505' || msg.includes('unique') || msg.includes('duplicate')) {
      return res.status(409).json({ error: 'This national ID or passport number is already registered.' });
    }
    return res.status(500).json({ error: error.message || 'Failed to save KYC details.' });
  }
});

app.patch('/api/me/pin', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { currentPin, newPin, confirmPin } = req.body ?? {};
    const current = typeof currentPin === 'string' ? currentPin.trim() : '';
    const next = typeof newPin === 'string' ? newPin.trim() : '';
    const confirm = typeof confirmPin === 'string' ? confirmPin.trim() : '';

    if (!/^\d{6}$/.test(current)) {
      return res.status(400).json({ error: 'Current PIN must be exactly 6 digits.' });
    }
    if (!/^\d{6}$/.test(next)) {
      return res.status(400).json({ error: 'New PIN must be exactly 6 digits.' });
    }
    if (next !== confirm) {
      return res.status(400).json({ error: 'New PIN confirmation does not match.' });
    }
    if (current === next) {
      return res.status(400).json({ error: 'New PIN must be different from current PIN.' });
    }

    const row = await loadKycRow(userId);
    if (!row?.pin_hash) {
      return res.status(400).json({ error: 'Set up your transaction PIN in KYC first.' });
    }
    const matches = await bcrypt.compare(current, row.pin_hash);
    if (!matches) {
      return res.status(401).json({ error: 'Current PIN is incorrect.' });
    }

    const nextHash = await bcrypt.hash(next, BCRYPT_ROUNDS);
    await sql`
      UPDATE user_profiles
      SET pin_hash = ${nextHash}, updated_at = NOW()
      WHERE user_id = ${userId}::uuid
    `;

    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to change PIN.' });
  }
});

app.patch('/api/me/profile', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { country, nationalId, pin } = req.body ?? {};
    const countryTrim = typeof country === 'string' ? country.trim() : '';
    const nationalTrim = typeof nationalId === 'string' ? nationalId.trim() : '';
    const pinStr = typeof pin === 'string' ? pin.trim() : '';

    if (!countryTrim || !nationalTrim) {
      return res.status(400).json({ error: 'Country and national ID or passport number are required.' });
    }
    if (!/^\d{6}$/.test(pinStr)) {
      return res.status(400).json({ error: 'Enter your current 6-digit transaction PIN to save changes.' });
    }

    const row = await loadKycRow(userId);
    if (!row?.pin_hash) {
      return res.status(400).json({ error: 'Set up your transaction PIN in KYC first.' });
    }
    const matches = await bcrypt.compare(pinStr, row.pin_hash);
    if (!matches) {
      return res.status(401).json({ error: 'Incorrect PIN.' });
    }

    await sql`
      UPDATE user_profiles
      SET
        country = ${countryTrim},
        national_id = ${nationalTrim},
        updated_at = NOW()
      WHERE user_id = ${userId}::uuid
    `;

    return res.json({ ok: true });
  } catch (error: any) {
    const msg = String(error?.message ?? error);
    const code = error?.code;
    if (code === '23505' || msg.includes('unique') || msg.includes('duplicate')) {
      return res.status(409).json({ error: 'This national ID or passport number is already registered.' });
    }
    return res.status(500).json({ error: error.message || 'Failed to update profile.' });
  }
});

app.get('/api/admin/profiles', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId || !isAdmin(userId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const rows = await sql`
      SELECT up.user_id AS id, u.email, u.phone, up.full_name, up.wallet_class, up.country, up.national_id, up.created_at
      FROM user_profiles up
      JOIN users u ON u.id = up.user_id
      ORDER BY up.created_at DESC
    `;

    return res.json({ profiles: rows });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to load profiles.' });
  }
});

app.patch('/api/admin/profiles/:targetUserId', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId || !isAdmin(userId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const { targetUserId } = req.params;
    const body = req.body ?? {};

    const [current] = await sql`
      SELECT u.email, u.phone, up.full_name, up.wallet_class, up.country, up.national_id
      FROM users u
      JOIN user_profiles up ON up.user_id = u.id
      WHERE u.id = ${targetUserId}::uuid
      LIMIT 1
    `;

    if (!current) {
      return res.status(404).json({ error: 'Profile not found.' });
    }

    const c = current as {
      email: string | null;
      phone: string | null;
      full_name: string;
      wallet_class: string;
      country: string | null;
      national_id: string | null;
    };

    const nextEmail = body.email !== undefined ? body.email : c.email;
    const nextPhone = body.phone !== undefined ? body.phone : c.phone;
    const nextName = body.full_name !== undefined ? body.full_name : c.full_name;
    const nextWalletClass = body.wallet_class !== undefined ? normalizeWalletClass(body.wallet_class, normalizeWalletClass(c.wallet_class, 'investor')) : normalizeWalletClass(c.wallet_class, 'investor');
    const nextCountry = body.country !== undefined ? body.country : c.country;
    const nextNational = body.national_id !== undefined ? body.national_id : c.national_id;

    await sql`
      UPDATE users
      SET email = ${nextEmail}, phone = ${nextPhone}, updated_at = NOW()
      WHERE id = ${targetUserId}::uuid
    `;
    await sql`
      UPDATE user_profiles
      SET
        full_name = ${nextName},
        wallet_class = ${nextWalletClass},
        country = ${nextCountry},
        national_id = ${nextNational},
        updated_at = NOW()
      WHERE user_id = ${targetUserId}::uuid
    `;
    await sql`
      UPDATE wallets
      SET wallet_type = ${nextWalletClass}, updated_at = NOW()
      WHERE user_id = ${targetUserId}::uuid
    `;
    if (body.wallet_class !== undefined) {
      await upsertWalletClassArtifacts(targetUserId, nextWalletClass, body as Record<string, unknown>);
    }

    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to update profile.' });
  }
});

// JSON 404 — if you still get HTML 404 from the app, traffic is not reaching this server (wrong port/process).
app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
});

async function start() {
  try {
    await ensureSchema();
    app.listen(port, '0.0.0.0', () => {
      console.log(`Ability Wallet backend running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start backend:', error);
    process.exit(1);
  }
}

start();
