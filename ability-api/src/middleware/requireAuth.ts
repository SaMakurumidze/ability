import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../auth/jwt';

export function getAuth(req: Request): { userId: string | null } {
  const id = (req as Request & { userId?: string }).userId;
  return { userId: id ?? null };
}

export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const payload = verifyAccessToken(token);
    if (!payload?.sub) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    (req as Request & { userId: string }).userId = payload.sub;
    next();
  };
}
