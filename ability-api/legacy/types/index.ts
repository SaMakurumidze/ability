import Decimal from 'decimal.js';

export interface JournalLineDto {
  ledgerAccountId: string;
  debitUsd: Decimal | string;
  creditUsd: Decimal | string;
}

export interface CreateJournalEntryDto {
  referenceCode: string;
  entryType: string;
  lines: JournalLineDto[];
  externalRef?: string;
  metadata?: Record<string, any>;
}

export interface WalletBalanceResponse {
  walletId: string;
  balanceUsd: string;
  currency: string;
  timestamp: string;
}

export interface TransactionResponse {
  id: string;
  walletId: string;
  type: string;
  amountUsd: string;
  status: string;
  createdAt: string;
}

export interface FxConversionRequest {
  amount: string;
  fromCurrency: string;
  toCurrency: string;
}

export interface FxConversionResponse {
  amountIn: string;
  amountOut: string;
  rate: string;
  spread: string;
  currency: string;
}

export interface TreasuryReconciliationResponse {
  clientLiabilityTotal: string;
  safeguardedAssetTotal: string;
  difference: string;
  coverageRatio: string;
  status: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
  accountType: 'ECONOMIC' | 'ADMIN';
  adminRole?: string;
}
