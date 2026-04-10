import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
import { LedgerService } from './ledger.service';
import { v4 as uuidv4 } from 'uuid';

export class InvestmentService {
  constructor(
    private prisma: PrismaClient,
    private ledgerService: LedgerService
  ) {}

  async debitWallet(
    walletId: string,
    amountUsd: string,
    externalRef: string,
    idempotencyKey: string
  ) {
    const existing = await this.prisma.investmentWebhook.findFirst({
      where: { idempotencyKey },
    });

    if (existing && existing.processed) {
      return { success: true, message: 'Already processed', transactionId: existing.id };
    }

    const amount = new Decimal(amountUsd);
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });

    if (!wallet) throw new Error('Wallet not found');

    const walletAccount = await this.prisma.ledgerAccount.findFirst({
      where: {
        walletId,
        accountType: 'LIABILITY',
      },
    });

    const operationalTreasury = await this.prisma.ledgerAccount.findUnique({
      where: { code: 'OPERATIONAL_TREASURY' },
    });

    if (!walletAccount || !operationalTreasury) {
      throw new Error('Required ledger accounts not found');
    }

    const referenceCode = `INV_DEBIT_${uuidv4().slice(0, 8)}`;

    const journalEntry = await this.ledgerService.createJournalEntry({
      referenceCode,
      entryType: 'INVEST',
      externalRef,
      lines: [
        {
          ledgerAccountId: walletAccount.id,
          debitUsd: amount,
          creditUsd: '0',
        },
        {
          ledgerAccountId: operationalTreasury.id,
          debitUsd: '0',
          creditUsd: amount,
        },
      ],
    });

    const transaction = await this.prisma.transaction.create({
      data: {
        walletId,
        transactionType: 'INVEST',
        amountUsd: amount.toString(),
        status: 'CONFIRMED',
        journalEntryId: journalEntry.id,
        externalRef,
        description: 'Investment debit',
      },
    });

    await this.prisma.investmentWebhook.upsert({
      where: { externalRef },
      update: { processed: true },
      create: {
        externalRef,
        idempotencyKey,
        webhookType: 'debit',
        payload: { walletId, amountUsd, externalRef },
        processed: true,
      },
    });

    return { success: true, transactionId: transaction.id };
  }

  async creditWallet(
    walletId: string,
    amountUsd: string,
    externalRef: string,
    idempotencyKey: string
  ) {
    const existing = await this.prisma.investmentWebhook.findFirst({
      where: { idempotencyKey },
    });

    if (existing && existing.processed) {
      return { success: true, message: 'Already processed', transactionId: existing.id };
    }

    const amount = new Decimal(amountUsd);
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });

    if (!wallet) throw new Error('Wallet not found');

    const walletAccount = await this.prisma.ledgerAccount.findFirst({
      where: {
        walletId,
        accountType: 'LIABILITY',
      },
    });

    const operationalTreasury = await this.prisma.ledgerAccount.findUnique({
      where: { code: 'OPERATIONAL_TREASURY' },
    });

    if (!walletAccount || !operationalTreasury) {
      throw new Error('Required ledger accounts not found');
    }

    const referenceCode = `INV_CREDIT_${uuidv4().slice(0, 8)}`;

    const journalEntry = await this.ledgerService.createJournalEntry({
      referenceCode,
      entryType: 'DISTRIBUTION',
      externalRef,
      lines: [
        {
          ledgerAccountId: operationalTreasury.id,
          debitUsd: amount,
          creditUsd: '0',
        },
        {
          ledgerAccountId: walletAccount.id,
          debitUsd: '0',
          creditUsd: amount,
        },
      ],
    });

    const transaction = await this.prisma.transaction.create({
      data: {
        walletId,
        transactionType: 'DISTRIBUTION',
        amountUsd: amount.toString(),
        status: 'CONFIRMED',
        journalEntryId: journalEntry.id,
        externalRef,
        description: 'Investment distribution return',
      },
    });

    await this.prisma.investmentWebhook.upsert({
      where: { externalRef },
      update: { processed: true },
      create: {
        externalRef,
        idempotencyKey,
        webhookType: 'credit',
        payload: { walletId, amountUsd, externalRef },
        processed: true,
      },
    });

    return { success: true, transactionId: transaction.id };
  }

  async getWalletBalance(walletId: string) {
    const balance = await this.ledgerService.getWalletBalance(walletId);
    return {
      walletId,
      balanceUsd: balance.toString(),
      currency: 'USD',
      timestamp: new Date().toISOString(),
    };
  }

  async handleWebhook(webhookData: {
    type: string;
    walletId: string;
    amountUsd: string;
    externalRef: string;
    idempotencyKey: string;
  }) {
    const { type, walletId, amountUsd, externalRef, idempotencyKey } = webhookData;

    switch (type) {
      case 'investment_confirmation':
        return this.debitWallet(walletId, amountUsd, externalRef, idempotencyKey);
      case 'distribution_return':
        return this.creditWallet(walletId, amountUsd, externalRef, idempotencyKey);
      default:
        throw new Error(`Unknown webhook type: ${type}`);
    }
  }
}
