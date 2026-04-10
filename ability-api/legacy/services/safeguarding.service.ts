import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
import { TreasuryService } from './treasury.service';

export class SafeguardingMonitor {
  private treasuryService: TreasuryService;
  private reconciliationInterval: NodeJS.Timeout | null = null;

  constructor(private prisma: PrismaClient) {
    this.treasuryService = new TreasuryService(prisma);
  }

  async startMonitoring(intervalMinutes: number = 60) {
    if (this.reconciliationInterval) {
      console.warn('Monitoring already started');
      return;
    }

    console.log(
      `Starting safeguarding monitor (interval: ${intervalMinutes} minutes)`
    );

    this.reconciliationInterval = setInterval(async () => {
      try {
        const result = await this.treasuryService.reconcile();
        console.log('Safeguarding reconciliation result:', result);

        if (result.status === 'DISCREPANCY') {
          console.error(
            `WARNING: Treasury discrepancy detected: ${result.difference} USD`
          );
          await this.notifyDiscrepancy(result);
        }
      } catch (error) {
        console.error('Safeguarding reconciliation error:', error);
      }
    }, intervalMinutes * 60 * 1000);
  }

  stopMonitoring() {
    if (this.reconciliationInterval) {
      clearInterval(this.reconciliationInterval);
      this.reconciliationInterval = null;
      console.log('Safeguarding monitoring stopped');
    }
  }

  private async notifyDiscrepancy(
    result: Awaited<ReturnType<TreasuryService['reconcile']>>
  ) {
    console.error(
      'ALERT: Treasury safeguarding rule violation detected:',
      result
    );
  }

  async validateWalletAllocation(walletId: string): Promise<boolean> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new Error(`Wallet not found: ${walletId}`);
    }

    const walletAccount = await this.prisma.ledgerAccount.findFirst({
      where: {
        walletId,
        accountType: 'LIABILITY',
      },
    });

    if (!walletAccount) {
      return false;
    }

    const walletBalance = new Decimal(walletAccount.balance);
    if (walletBalance.isNegative()) {
      console.error(
        `Invalid wallet state: negative balance for wallet ${walletId}`
      );
      return false;
    }

    const isValid = await this.treasuryService.verifySafeguardingRule();
    return isValid;
  }

  async getStatus() {
    const isBalanced = await this.treasuryService.verifySafeguardingRule();
    const clientLiabilities =
      await this.treasuryService.calculateClientLiabilities();
    const safeguardedAssets =
      await this.treasuryService.calculateSafeguardedAssets();

    return {
      safeguarding_rule_satisfied: isBalanced,
      client_liabilities: clientLiabilities.toString(),
      safeguarded_assets: safeguardedAssets.toString(),
      timestamp: new Date().toISOString(),
    };
  }

  async getAuditTrail(limit: number = 100) {
    return this.prisma.treasuryReconciliation.findMany({
      orderBy: { date: 'desc' },
      take: limit,
    });
  }
}
