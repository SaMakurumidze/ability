CRITICAL ARCHITECTURE NOTE
Ability Wallet is NOT a crypto wallet.
Ability Wallet is NOT blockchain based.
Ability Wallet is a centralized fintech wallet using a USD double-entry accounting ledger, similar to platforms like:
•	Stripe
•	Wise
•	PayPal
All balances are derived from ledger journal entries stored in PostgreSQL.
There are:
•	NO blockchain addresses
•	NO tokens
•	NO crypto networks
Wallet balances are computed from ledger entries only.

PROJECT GOAL
Build Ability Wallet, a USD-denominated fintech wallet platform integrated with an external investment platform.
Users can:
•	Xchange funds (internal transfers)
•	Inject funds (deposit)
•	Withdraw funds
•	Invest capital into external investment opportunities
The platform uses double-entry accounting and treasury safeguarding rules.

TECH STACK
Backend
Node.js
TypeScript
Express.js
Database
PostgreSQL
ORM
Prisma
Mobile App
React Native + Expo
Web Dashboard
Next.js
API
REST + Webhooks
Authentication
JWT

USER TYPES
ECONOMIC USERS
INDIVIDUAL
BUSINESS
GOVERNMENT
These users own wallets.

ADMIN USERS
ASSOCIATE_ADMIN
JUNIOR_CONSULTANT
SENIOR_CONSULTANT
Admins cannot own wallets.
Admins only initiate workflows and monitor the system.

WALLET MODEL
Each economic user has a USD wallet.
Wallet balances are not stored directly.
Balances are derived from ledger entries.
Balance formula:
balance = SUM(debit_usd − credit_usd)

CORE DATABASE TABLES
Users
id
email
phone
password_hash
account_type (ECONOMIC | ADMIN)
status
created_at

Wallets
id
user_id
wallet_type (INDIVIDUAL | BUSINESS | GOVERNMENT)
base_currency = USD
status
created_at

LedgerAccounts
id
wallet_id (nullable)
account_type (ASSET | LIABILITY | REVENUE | EQUITY | SYSTEM)
code
name

JournalEntries
id
reference_code
entry_type
external_ref
metadata
created_at

JournalLines
id
journal_entry_id
ledger_account_id
debit_usd
credit_usd

ACCOUNTING CONSTRAINT
Every journal entry must satisfy:
SUM(debit_usd) = SUM(credit_usd)
Journal entries are immutable once committed.

SYSTEM LEDGER ACCOUNTS
Create the following system accounts:
Safeguarding_Bank (ASSET)
Operational_Treasury (ASSET)
FX_Liquidity_Pool (ASSET)
Settlement_Clearing (SYSTEM)
FX_Clearing (SYSTEM)
Protected_Capital_Pool (LIABILITY)
FX_Revenue (REVENUE)
Platform_Equity (EQUITY)

PROTECTED CAPITAL RULE
All investor capital must first enter the Protected Capital Pool before being allocated.
Investor deposit journal entry:
Debit Safeguarding_Bank
Credit Protected_Capital_Pool
Wallet allocation entry:
Debit Protected_Capital_Pool
Credit Client_Wallet

WALLET OPERATIONS
XCHANGE
Internal wallet transfer.
Journal Entry:
Debit Sender_Wallet
Credit Receiver_Wallet

INJECT (Deposit)
User deposits local currency.
System converts to USD using buy_rate.
Journal Entry:
Debit Safeguarding_Bank
Credit Client_Wallet
Spread entry:
Debit FX_Clearing
Credit FX_Revenue

WITHDRAW
User withdraws funds.
USD converted to local currency using sell_rate.
Journal Entry:
Debit Client_Wallet
Credit Safeguarding_Bank
Spread entry:
Debit FX_Clearing
Credit FX_Revenue

FX RATE TABLE
FxRates
id
base_currency (USD)
quote_currency
mid_rate
buy_rate
sell_rate
spread_bps
effective_at
expires_at
source
FX conversion happens only during Inject and Withdraw.

TREASURY SAFEGUARDING RULE
Client liabilities must equal safeguarded assets.
Rule:
SUM(Client Wallet Liabilities)
=
Safeguarding_Bank balance

TREASURY RECONCILIATION TABLE
TreasuryReconciliations
id
date
client_liability_total
safeguarded_asset_total
difference
status

SAFEGUARDING REPORTS
SafeguardingReports
id
period
total_client_liabilities
total_safeguarded_assets
coverage_ratio
generated_at

EXTERNAL INVESTMENT PLATFORM
Wallet must integrate with an external investment platform.
Expose APIs:
debit_wallet()
credit_wallet()
get_wallet_balance()

INVESTMENT WEBHOOKS
Receive webhooks:
investment_confirmation
distribution_return
Store:
external_ref
idempotency_key

ADMIN AUDIT LOG
AuditLogs
id
admin_user_id
action
entity_type
entity_id
timestamp
All admin actions must be logged.

CROSS-BORDER WITHDRAWALS
User selects payout country.
System converts:
USD → Local Currency
Store:
fx_rate_used
local_amount_paid
spread_amount_usd

MOBILE APP (React Native + Expo)
Features:
Signup / Login
Wallet Balance
Transaction History
Xchange Transfers
Inject Deposits
Withdraw
Investment Authorization
Profile Settings

WEB DASHBOARD (Next.js)
For BUSINESS and GOVERNMENT users.
Features:
Wallet Overview
Transaction Monitoring
Investments
Withdrawals
Deposits
Reports

BACKEND SERVICES TO GENERATE
Generate the following services:
1.	Ledger Service (double-entry accounting)
2.	Wallet Service
3.	FX Conversion Service
4.	Treasury Reconciliation Service
5.	Safeguarding Monitor
6.	Investment Webhook Service
7.	RBAC Middleware
8.	Transaction Service
OUTPUT REQUIRED FROM BOLT
Generate:
1.	Backend folder structure
2.	Prisma PostgreSQL schema
3.	Double-entry ledger service
4.	FX conversion service
5.	Treasury reconciliation service
6.	Safeguarding monitor
7.	Investment webhook service
8.	RBAC middleware
9.	React Native Expo mobile scaffold
10.	Next.js dashboard scaffold
11.	ERD diagram (text format)
12.	Full README explaining architecture

