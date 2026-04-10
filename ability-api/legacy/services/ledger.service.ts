import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import { CreateJournalEntryDto } from '../types';

export class LedgerService {
  constructor(private prisma: PrismaClient) {}

  async createJournalEntry(dto: CreateJournalEntryDto) {
    const totalDebits = dto.lines.reduce(
      (sum, line) => sum.plus(new Decimal(line.debitUsd || 0)),
      new Decimal(0)
    );

    const totalCredits = dto.lines.reduce(
      (sum, line) => sum.plus(new Decimal(line.creditUsd || 0)),
      new Decimal(0)
    );

    if (!totalDebits.equals(totalCredits)) {
      throw new Error(
        `Journal entry must balance. Debits: ${totalDebits}, Credits: ${totalCredits}`
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          referenceCode: dto.referenceCode,
          entryType: dto.entryType,
          externalRef: dto.externalRef,
          metadata: dto.metadata,
          journalLines: {
            create: dto.lines.map((line) => ({
              ledgerAccountId: line.ledgerAccountId,
              debitUsd: line.debitUsd.toString(),
              creditUsd: line.creditUsd.toString(),
            })),
          },
        },
        include: { journalLines: true },
      });

      for (const line of dto.lines) {
        const account = await tx.ledgerAccount.findUnique({
          where: { id: line.ledgerAccountId },
        });

        if (!account) throw new Error(`Account not found: ${line.ledgerAccountId}`);

        const currentBalance = new Decimal(account.balance);
        const debit = new Decimal(line.debitUsd || 0);
        const credit = new Decimal(line.creditUsd || 0);
        const newBalance = currentBalance.plus(debit).minus(credit);

        await tx.ledgerAccount.update({
          where: { id: line.ledgerAccountId },
          data: { balance: newBalance.toString() },
        });
      }

      return entry;
    });
  }

  async getAccountBalance(accountId: string): Promise<Decimal> {
    const account = await this.prisma.ledgerAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) throw new Error(`Account not found: ${accountId}`);
    return new Decimal(account.balance);
  }

  async getWalletBalance(walletId: string): Promise<Decimal> {
    const accounts = await this.prisma.ledgerAccount.findMany({
      where: { walletId },
    });

    return accounts.reduce((sum, account) => {
      const balance = new Decimal(account.balance);
      if (account.accountType === 'ASSET') {
        return sum.plus(balance);
      } else if (account.accountType === 'LIABILITY') {
        return sum.minus(balance);
      }
      return sum;
    }, new Decimal(0));
  }

  async listJournalEntries(limit: number = 50, offset: number = 0) {
    return this.prisma.journalEntry.findMany({
      include: { journalLines: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async lockJournalEntry(journalEntryId: string) {
    return this.prisma.journalEntry.update({
      where: { id: journalEntryId },
      data: { locked: true },
    });
  }
}
