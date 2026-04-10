import { PrismaClient, WalletType, WalletStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { LedgerService } from './ledger.service';
import { v4 as uuidv4 } from 'uuid';

export class WalletService {
  constructor(
    private prisma: PrismaClient,
    private ledgerService: LedgerService
  ) {}

  async createWallet(userId: string, walletType: WalletType) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.create({
        data: {
          userId,
          walletType,
          baseCurrency: 'USD',
          status: WalletStatus.ACTIVE,
        },
      });

      const clientWalletAccount = await tx.ledgerAccount.create({
        data: {
          walletId: wallet.id,
          accountType: 'LIABILITY',
          code: `WALLET_${wallet.id.slice(0, 8)}`,
          name: `Client Wallet - ${walletType}`,
          description: `USD wallet for ${walletType} user`,
        },
      });

      return {
        ...wallet,
        mainAccountId: clientWalletAccount.id,
      };
    });
  }

  async getWalletBalance(walletId: string): Promise<string> {
    const balance = await this.ledgerService.getWalletBalance(walletId);
    return balance.toString();
  }

  async injectFunds(walletId: string, amountUsd: string, referenceCode: string) {
    const amount = new Decimal(amountUsd);

    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new Error('Wallet not found');

    const safeguardingBank = await this.prisma.ledgerAccount.findUnique({
      where: { code: 'SAFEGUARDING_BANK' },
    });

    const walletAccount = await this.prisma.ledgerAccount.findFirst({
      where: {
        walletId,
        accountType: 'LIABILITY',
      },
    });

    if (!safeguardingBank || !walletAccount) {
      throw new Error('Required ledger accounts not found');
    }

    const journalEntry = await this.ledgerService.createJournalEntry({
      referenceCode,
      entryType: 'INJECT',
      lines: [
        {
          ledgerAccountId: safeguardingBank.id,
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

    return this.prisma.transaction.create({
      data: {
        walletId,
        transactionType: 'INJECT',
        amountUsd: amount.toString(),
        status: 'CONFIRMED',
        journalEntryId: journalEntry.id,
        externalRef: referenceCode,
      },
    });
  }

  async withdrawFunds(walletId: string, amountUsd: string, referenceCode: string) {
    const amount = new Decimal(amountUsd);

    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new Error('Wallet not found');

    const currentBalance = await this.getWalletBalance(walletId);
    if (new Decimal(currentBalance).lessThan(amount)) {
      throw new Error('Insufficient balance');
    }

    const safeguardingBank = await this.prisma.ledgerAccount.findUnique({
      where: { code: 'SAFEGUARDING_BANK' },
    });

    const walletAccount = await this.prisma.ledgerAccount.findFirst({
      where: {
        walletId,
        accountType: 'LIABILITY',
      },
    });

    if (!safeguardingBank || !walletAccount) {
      throw new Error('Required ledger accounts not found');
    }

    const journalEntry = await this.ledgerService.createJournalEntry({
      referenceCode,
      entryType: 'WITHDRAW',
      lines: [
        {
          ledgerAccountId: walletAccount.id,
          debitUsd: amount,
          creditUsd: '0',
        },
        {
          ledgerAccountId: safeguardingBank.id,
          debitUsd: '0',
          creditUsd: amount,
        },
      ],
    });

    return this.prisma.transaction.create({
      data: {
        walletId,
        transactionType: 'WITHDRAW',
        amountUsd: amount.toString(),
        status: 'CONFIRMED',
        journalEntryId: journalEntry.id,
        externalRef: referenceCode,
      },
    });
  }

  async xchangeTransfer(
    senderWalletId: string,
    receiverWalletId: string,
    amountUsd: string,
    referenceCode: string
  ) {
    const amount = new Decimal(amountUsd);

    const senderBalance = await this.getWalletBalance(senderWalletId);
    if (new Decimal(senderBalance).lessThan(amount)) {
      throw new Error('Insufficient balance');
    }

    const senderAccount = await this.prisma.ledgerAccount.findFirst({
      where: {
        walletId: senderWalletId,
        accountType: 'LIABILITY',
      },
    });

    const receiverAccount = await this.prisma.ledgerAccount.findFirst({
      where: {
        walletId: receiverWalletId,
        accountType: 'LIABILITY',
      },
    });

    if (!senderAccount || !receiverAccount) {
      throw new Error('Invalid wallet accounts');
    }

    const journalEntry = await this.ledgerService.createJournalEntry({
      referenceCode,
      entryType: 'XCHANGE',
      lines: [
        {
          ledgerAccountId: senderAccount.id,
          debitUsd: amount,
          creditUsd: '0',
        },
        {
          ledgerAccountId: receiverAccount.id,
          debitUsd: '0',
          creditUsd: amount,
        },
      ],
    });

    return this.prisma.transaction.create({
      data: {
        walletId: senderWalletId,
        transactionType: 'XCHANGE',
        amountUsd: amount.toString(),
        status: 'CONFIRMED',
        journalEntryId: journalEntry.id,
        externalRef: referenceCode,
      },
    });
  }

  async getTransactionHistory(walletId: string, limit: number = 50) {
    return this.prisma.transaction.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
