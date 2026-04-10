import jwt from 'jsonwebtoken';

/** Read env at call time so `dotenv.config()` in index.ts has run (imports run before index body). */
export function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error('Missing JWT_SECRET. Set a long random string in ability-api/.env');
  }
  return secret;
}

function accessTokenExpiresIn(): string {
  const raw = process.env.JWT_EXPIRES_IN?.trim();
  return raw && raw.length > 0 ? raw : '7d';
}

export function signAccessToken(userId: string): string {
  const expiresIn = accessTokenExpiresIn() as jwt.SignOptions['expiresIn'];
  return jwt.sign({ sub: userId }, requireJwtSecret(), { expiresIn });
}

export function verifyAccessToken(token: string): { sub: string } | null {
  try {
    const payload = jwt.verify(token, requireJwtSecret()) as jwt.JwtPayload;
    const sub = typeof payload.sub === 'string' ? payload.sub : null;
    if (!sub) return null;
    return { sub };
  } catch {
    return null;
  }
}
