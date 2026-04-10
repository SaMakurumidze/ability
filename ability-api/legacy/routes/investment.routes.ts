import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { LedgerService } from '../services/ledger.service';
import { InvestmentService } from '../services/investment.service';

export function createInvestmentRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const ledgerService = new LedgerService(prisma);
  const investmentService = new InvestmentService(prisma, ledgerService);

  router.post('/debit', async (req: Request, res: Response) => {
    try {
      const { walletId, amountUsd, externalRef, idempotencyKey } = req.body;

      if (!walletId || !amountUsd || !externalRef || !idempotencyKey) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const result = await investmentService.debitWallet(
        walletId,
        amountUsd,
        externalRef,
        idempotencyKey
      );

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/credit', async (req: Request, res: Response) => {
    try {
      const { walletId, amountUsd, externalRef, idempotencyKey } = req.body;

      if (!walletId || !amountUsd || !externalRef || !idempotencyKey) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const result = await investmentService.creditWallet(
        walletId,
        amountUsd,
        externalRef,
        idempotencyKey
      );

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/balance/:walletId', async (req: Request, res: Response) => {
    try {
      const { walletId } = req.params;
      const result = await investmentService.getWalletBalance(walletId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/webhook', async (req: Request, res: Response) => {
    try {
      const { type, walletId, amountUsd, externalRef, idempotencyKey } = req.body;

      if (!type || !walletId || !amountUsd || !externalRef || !idempotencyKey) {
        return res.status(400).json({ error: 'Missing required webhook fields' });
      }

      const result = await investmentService.handleWebhook({
        type,
        walletId,
        amountUsd,
        externalRef,
        idempotencyKey,
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}
