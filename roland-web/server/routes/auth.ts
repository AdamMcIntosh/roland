import { Router } from 'express';
import { checkCredentials, signToken } from '../auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { username, password, cursorApiKey } = req.body ?? {};

  if (!username || !password) {
    res.status(400).json({ error: 'username and password required' });
    return;
  }

  if (!cursorApiKey && !process.env.CURSOR_API_KEY) {
    res.status(400).json({ error: 'cursorApiKey required — set CURSOR_API_KEY on the server or provide it at login' });
    return;
  }

  if (!(await checkCredentials(username, password))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = signToken('admin');

  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ ok: true });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie('auth_token');
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  const token = (req as any).cookies?.auth_token;
  if (!token) { res.status(401).json({ error: 'Not authenticated' }); return; }
  res.json({ ok: true });
});
