import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

interface JwtPayload {
  userId: string;
  iat: number;
  exp: number;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET not set');
  return s;
}

export function signToken(userId: string): string {
  return jwt.sign({ userId }, secret(), { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, secret()) as JwtPayload;
  } catch {
    return null;
  }
}

export async function checkCredentials(username: string, password: string): Promise<boolean> {
  const expectedUser = process.env.AUTH_USERNAME ?? 'admin';
  const expectedPass = process.env.AUTH_PASSWORD ?? '';
  if (username !== expectedUser) return false;
  if (expectedPass.startsWith('$2')) return bcrypt.compare(password, expectedPass);
  return password === expectedPass;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = (req as any).cookies?.auth_token as string | undefined;
  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const payload = verifyToken(token);
  if (!payload) { res.status(401).json({ error: 'Invalid token' }); return; }

  const apiKey = req.headers['x-cursor-api-key'] as string | undefined;
  if (!apiKey) {
    res.status(401).json({ error: 'x-cursor-api-key header required' });
    return;
  }

  (req as any).userId = payload.userId;
  (req as any).cursorApiKey = apiKey;
  next();
}
