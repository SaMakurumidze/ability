import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { TreasuryService } from '../services/treasury.service';
import { SafeguardingMonitor } from '../services/safeguarding.service';
import { FxService } from '../services/fx.service';

export function createAdminRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const treasuryService = new TreasuryService(prisma);
  const safeguardingMonitor = new SafeguardingMonitor(prisma);
  const fxService = new FxService(prisma);

  router.get('/treasury/reconciliation', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const result = await treasuryService.reconcile();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/treasury/status', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const status = await safeguardingMonitor.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/treasury/reconciliations', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const reconciliations = await treasuryService.getRecentReconciliations(limit);
      res.json(reconciliations);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/treasury/report', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const { period } = req.body;
      if (!period) {
        return res.status(400).json({ error: 'period required' });
      }

      const report = await treasuryService.generateReport(period);
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/fx/rate', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const { baseCurrency, quoteCurrency, midRate, buyRate, sellRate, spreadBps } = req.body;

      if (!baseCurrency || !quoteCurrency || !midRate || !buyRate || !sellRate) {
        return res.status(400).json({ error: 'Missing required FX rate fields' });
      }

      const rate = await fxService.setRate(
        baseCurrency,
        quoteCurrency,
        midRate,
        buyRate,
        sellRate,
        spreadBps || 50
      );

      res.json(rate);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/fx/rates', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const rates = await fxService.getActiveRates();
      res.json(rates);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/audit-logs', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await prisma.auditLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: limit,
        include: { adminUser: { select: { email: true } } },
      });

      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}
