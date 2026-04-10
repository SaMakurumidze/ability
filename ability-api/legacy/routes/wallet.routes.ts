import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, economicMiddleware } from '../middleware/auth';
import { LedgerService } from '../services/ledger.service';
import { WalletService } from '../services/wallet.service';
import { TreasuryService } from '../services/treasury.service';
import { v4 as uuidv4 } from 'uuid';

export function createWalletRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const ledgerService = new LedgerService(prisma);
  const walletService = new WalletService(prisma, ledgerService);
  const treasuryService = new TreasuryService(prisma);

  router.get('/balance', authMiddleware, economicMiddleware, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const wallet = await prisma.wallet.findUnique({
        where: { userId: user.userId },
      });

      if (!wallet) {
        return res.status(404).json({ error: 'Wallet not found' });
      }

      const balance = await walletService.getWalletBalance(wallet.id);
      res.json({
        walletId: wallet.id,
        balanceUsd: balance,
        currency: 'USD',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/inject', authMiddleware, economicMiddleware, async (req: Request, res: Response) => {
    try {
      const { amountUsd } = req.body;
      const user = req.user!;

      if (!amountUsd) {
        return res.status(400).json({ error: 'amountUsd required' });
      }

      const wallet = await prisma.wallet.findUnique({
        where: { userId: user.userId },
      });

      if (!wallet) {
        return res.status(404).json({ error: 'Wallet not found' });
      }

      const referenceCode = `INJ_${uuidv4().slice(0, 8)}`;
      const transaction = await walletService.injectFunds(wallet.id, amountUsd, referenceCode);

      res.json(transaction);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/withdraw', authMiddleware, economicMiddleware, async (req: Request, res: Response) => {
    try {
      const { amountUsd } = req.body;
      const user = req.user!;

      if (!amountUsd) {
        return res.status(400).json({ error: 'amountUsd required' });
      }

      const wallet = await prisma.wallet.findUnique({
        where: { userId: user.userId },
      });

      if (!wallet) {
        return res.status(404).json({ error: 'Wallet not found' });
      }

      const referenceCode = `WTH_${uuidv4().slice(0, 8)}`;
      const transaction = await walletService.withdrawFunds(wallet.id, amountUsd, referenceCode);

      res.json(transaction);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/xchange', authMiddleware, economicMiddleware, async (req: Request, res: Response) => {
    try {
      const { receiverUserId, amountUsd } = req.body;
      const senderUser = req.user!;

      if (!receiverUserId || !amountUsd) {
        return res.status(400).json({ error: 'receiverUserId and amountUsd required' });
      }

      const senderWallet = await prisma.wallet.findUnique({
        where: { userId: senderUser.userId },
      });

      const receiverWallet = await prisma.wallet.findUnique({
        where: { userId: receiverUserId },
      });

      if (!senderWallet || !receiverWallet) {
        return res.status(404).json({ error: 'One or both wallets not found' });
      }

      const referenceCode = `XCH_${uuidv4().slice(0, 8)}`;
      const transaction = await walletService.xchangeTransfer(
        senderWallet.id,
        receiverWallet.id,
        amountUsd,
        referenceCode
      );

      res.json(transaction);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/history', authMiddleware, economicMiddleware, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const wallet = await prisma.wallet.findUnique({
        where: { userId: user.userId },
      });

      if (!wallet) {
        return res.status(404).json({ error: 'Wallet not found' });
      }

      const transactions = await walletService.getTransactionHistory(wallet.id);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}
