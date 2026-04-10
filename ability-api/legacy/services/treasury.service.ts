import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
import { TreasuryReconciliationResponse } from '../types';

export class TreasuryService {
  constructor(private prisma: PrismaClient) {}

  async calculateClientLiabilities(): Promise<Decimal> {
    const wallets = await this.prisma.wallet.findMany();
    let totalLiability = new Decimal(0);

    for (const wallet of wallets) {
      const walletAccounts = await this.prisma.ledgerAccount.findMany({
        where: {
          walletId: wallet.id,
          accountType: 'LIABILITY',
        },
      });

      for (const account of walletAccounts) {
        totalLiability = totalLiability.plus(new Decimal(account.balance));
      }
    }

    return totalLiability;
  }

  async calculateSafeguardedAssets(): Promise<Decimal> {
    const safeguardingBank = await this.prisma.ledgerAccount.findUnique({
      where: { code: 'SAFEGUARDING_BANK' },
    });

    if (!safeguardingBank) {
      throw new Error('Safeguarding bank account not found');
    }

    return new Decimal(safeguardingBank.balance);
  }

  async verifySafeguardingRule(): Promise<boolean> {
    const clientLiabilities = await this.calculateClientLiabilities();
    const safeguardedAssets = await this.calculateSafeguardedAssets();

    return clientLiabilities.equals(safeguardedAssets);
  }

  async reconcile(): Promise<TreasuryReconciliationResponse> {
    const clientLiabilities = await this.calculateClientLiabilities();
    const safeguardedAssets = await this.calculateSafeguardedAssets();
    const difference = safeguardedAssets.minus(clientLiabilities);

    const isBalanced = difference.equals(0);

    const reconciliation = await this.prisma.treasuryReconciliation.create({
      data: {
        date: new Date(),
        clientLiabilityTotal: clientLiabilities.toString(),
        safeguardedAssetTotal: safeguardedAssets.toString(),
        difference: difference.toString(),
        status: isBalanced ? 'BALANCED' : 'DISCREPANCY',
      },
    });

    if (!isBalanced) {
      console.warn(
        `Treasury reconciliation discrepancy: ${difference.toString()} USD`
      );
    }

    return {
      clientLiabilityTotal: clientLiabilities.toString(),
      safeguardedAssetTotal: safeguardedAssets.toString(),
      difference: difference.toString(),
      coverageRatio: safeguardedAssets
        .dividedBy(clientLiabilities)
        .toString(),
      status: isBalanced ? 'BALANCED' : 'DISCREPANCY',
    };
  }

  async generateReport(period: string) {
    const clientLiabilities = await this.calculateClientLiabilities();
    const safeguardedAssets = await this.calculateSafeguardedAssets();
    const coverageRatio =
      clientLiabilities.isZero()
        ? new Decimal(0)
        : safeguardedAssets.dividedBy(clientLiabilities);

    return this.prisma.safeguardingReport.create({
      data: {
        period,
        totalClientLiabilities: clientLiabilities.toString(),
        totalSafeguardedAssets: safeguardedAssets.toString(),
        coverageRatio: coverageRatio.toString(),
      },
    });
  }

  async getRecentReconciliations(limit: number = 10) {
    return this.prisma.treasuryReconciliation.findMany({
      orderBy: { date: 'desc' },
      take: limit,
    });
  }
}
