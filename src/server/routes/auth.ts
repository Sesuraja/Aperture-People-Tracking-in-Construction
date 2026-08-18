import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { getCollectionDocs, upsertDoc, logAuditEvent } from '../services/db.js';
import { generateToken, requireAuth, AuthRequest, verifyFirebaseTokenRS256 } from '../middleware/auth.js';

export const authRouter = Router();

// Rate limiter for auth endpoints: 15 requests per 15 minutes
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many login or registration attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required')
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().optional(),
  role: z.string().optional().default('viewer')
});

// Helper function to sanitize user object (strip passwords)
export function sanitizeUser(user: any) {
  if (!user) return null;
  const { password, passwordHash, ...clean } = user;
  return clean;
}

// Admin bootstrap helper
export async function bootstrapAdminUser() {
  const adminEmail = (process.env.ADMIN_INITIAL_EMAIL || 'sigmund.t.d@gaostaff.com').toLowerCase();
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'password123';

  const users = await getCollectionDocs('users');
  const existing = users.find((u: any) => u.email?.toLowerCase() === adminEmail);

  if (!existing) {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const adminUser = {
      id: `usr_admin_${Date.now()}`,
      email: adminEmail,
      name: 'Primary Admin',
      role: 'admin',
      passwordHash: hashedPassword,
      createdAt: new Date().toISOString()
    };
    await upsertDoc('users', adminUser);
    console.log(`[Auth Bootstrap] Initial admin user '${adminEmail}' created.`);
  }
}

// POST /api/auth/register
authRouter.post('/register', authRateLimiter, async (req: Request, res: Response) => {
  const parseResult = registerSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid registration input',
      details: parseResult.error.issues
    });
  }

  const { email, password, name, role } = parseResult.data;
  const lowerEmail = email.toLowerCase();

  try {
    const users = await getCollectionDocs('users');
    const existing = users.find((u: any) => u.email?.toLowerCase() === lowerEmail);

    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const assignedRole = lowerEmail.endsWith('@gaostaff.com') ? 'admin' : role;

    const newUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      email: lowerEmail,
      name: name || lowerEmail.split('@')[0],
      role: assignedRole,
      passwordHash,
      tokenVersion: 1,
      createdAt: new Date().toISOString()
    };

    await upsertDoc('users', newUser);
    const token = generateToken({
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      tokenVersion: newUser.tokenVersion
    });

    await logAuditEvent({
      userId: newUser.id,
      userEmail: newUser.email,
      action: 'USER_REGISTER',
      resource: 'users',
      ip: req.ip
    });

    return res.json({
      message: 'User registered successfully',
      user: sanitizeUser(newUser),
      token
    });
  } catch (err: any) {
    console.error('[Auth Route] Register error:', err);
    return res.status(500).json({ error: 'Server error during registration' });
  }
});

// POST /api/auth/login
authRouter.post('/login', authRateLimiter, async (req: Request, res: Response) => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid login input',
      details: parseResult.error.issues
    });
  }

  const { email, password } = parseResult.data;
  const lowerEmail = email.toLowerCase();

  try {
    const users = await getCollectionDocs('users');
    let user = users.find((u: any) => u.email?.toLowerCase() === lowerEmail);

    if (!user) {
      await logAuditEvent({
        userEmail: lowerEmail,
        action: 'USER_LOGIN_FAILED',
        resource: 'auth',
        details: { reason: 'User not found' },
        ip: req.ip
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    let isValid = false;
    if (user.passwordHash) {
      isValid = await bcrypt.compare(password, user.passwordHash);
    } else if (user.password) {
      // Legacy unhashed password migration fallback
      isValid = user.password === password;
      if (isValid) {
        // Upgrade to hashed password immediately
        user.passwordHash = await bcrypt.hash(password, 10);
        delete user.password;
        await upsertDoc('users', user);
      }
    }

    if (!isValid) {
      await logAuditEvent({
        userId: user.id,
        userEmail: lowerEmail,
        action: 'USER_LOGIN_FAILED',
        resource: 'auth',
        details: { reason: 'Invalid password' },
        ip: req.ip
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const tokenVersion = user.tokenVersion || 1;
    
    // Update login audit/session metadata
    user.hasLoggedIn = true;
    user.lastLogin = new Date().toISOString();
    await upsertDoc('users', user);

    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tokenVersion
    });

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      action: 'USER_LOGIN_SUCCESS',
      resource: 'auth',
      ip: req.ip
    });

    return res.json({
      message: 'Login successful',
      user: sanitizeUser(user),
      token
    });
  } catch (err: any) {
    console.error('[Auth Route] Login error:', err);
    return res.status(500).json({ error: 'Server error during login' });
  }
});

// POST /api/auth/firebase-login
authRouter.post('/firebase-login', authRateLimiter, async (req: Request, res: Response) => {
  const { idToken, role } = req.body || {};
  if (!idToken || typeof idToken !== 'string') {
    return res.status(400).json({ error: 'ID token is required' });
  }

  try {
    const firebaseUser = await verifyFirebaseTokenRS256(idToken);
    if (!firebaseUser) {
      return res.status(401).json({ error: 'Invalid or expired Firebase ID token' });
    }

    const lowerEmail = (firebaseUser.email || '').toLowerCase();
    const users = await getCollectionDocs('users');
    let user = users.find((u: any) => u.id === firebaseUser.id || (u.email && u.email.toLowerCase() === lowerEmail));

    const assignedRole = role || (lowerEmail.endsWith('@gaostaff.com') ? 'admin' : (user?.role || 'operator'));

    if (!user) {
      user = {
        id: firebaseUser.id || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        email: lowerEmail,
        name: firebaseUser.name || lowerEmail.split('@')[0] || 'Google User',
        displayName: firebaseUser.name || lowerEmail.split('@')[0] || 'Google User',
        role: assignedRole,
        tokenVersion: 1,
        createdAt: new Date().toISOString()
      };
    } else {
      user.role = role || user.role || assignedRole;
      if (firebaseUser.name && !user.name) user.name = firebaseUser.name;
    }

    user.hasLoggedIn = true;
    user.lastLogin = new Date().toISOString();
    await upsertDoc('users', user);

    try {
      await upsertDoc('settings', {
        id: `user_role_${user.id}`,
        uid: user.id,
        email: user.email,
        displayName: user.name || user.email?.split('@')[0],
        role: user.role,
        updatedAt: new Date().toISOString()
      });
    } catch (settingErr) {
      console.warn('[Auth Route] Failed to sync user_role setting:', settingErr);
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tokenVersion: user.tokenVersion || 1
    });

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      action: 'FIREBASE_GOOGLE_LOGIN_SUCCESS',
      resource: 'auth',
      ip: req.ip
    });

    return res.json({
      message: 'Firebase authentication successful',
      user: sanitizeUser(user),
      token
    });
  } catch (err: any) {
    console.error('[Auth Route] Firebase login error:', err);
    return res.status(500).json({ error: 'Server error during Firebase authentication' });
  }
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, (req: AuthRequest, res: Response) => {
  return res.json({ user: req.user });
});

// POST /api/auth/logout
authRouter.post('/logout', async (req: Request, res: Response) => {
  return res.json({ success: true, message: 'Logged out successfully' });
});

// POST /api/auth/logout-everywhere
authRouter.post('/logout-everywhere', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const users = await getCollectionDocs('users');
    const userDoc = users.find((u: any) => u.id === req.user?.id);

    if (userDoc) {
      const nextVersion = (userDoc.tokenVersion || 1) + 1;
      userDoc.tokenVersion = nextVersion;
      await upsertDoc('users', userDoc);

      await logAuditEvent({
        userId: req.user.id,
        userEmail: req.user.email,
        action: 'LOGOUT_EVERYWHERE_REVOKED_SESSIONS',
        resource: 'auth',
        details: { newVersion: nextVersion },
        ip: req.ip
      });

      return res.json({
        message: 'All active sessions successfully invalidated. Please log in again with your credentials.',
        tokenVersion: nextVersion
      });
    }

    return res.status(404).json({ error: 'User record not found' });
  } catch (err: any) {
    console.error('[Auth Route] Logout everywhere error:', err);
    return res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});
