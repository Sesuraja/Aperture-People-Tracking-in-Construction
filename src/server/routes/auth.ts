import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { getCollectionDocs, getDocById, upsertDoc, logAuditEvent } from '../services/db.js';
import { generateToken, requireAuth, AuthRequest, verifyFirebaseTokenRS256 } from '../middleware/auth.js';

export const authRouter = Router();

// Rate limiter for auth endpoints: 15 requests per 15 minutes (skipped in tests)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  skip: () => process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST),
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
  role: z.string().optional().default('viewer'),
  organizationName: z.string().optional(),
  organizationId: z.string().optional()
});

// Helper function to sanitize user object (strip passwords)
export function sanitizeUser(user: any) {
  if (!user) return null;
  const { password, passwordHash, ...clean } = user;
  return clean;
}

// Admin bootstrap helper (only seeds admin user if ADMIN_INITIAL_EMAIL is explicitly set in .env)
export async function bootstrapAdminUser() {
  const adminEmail = process.env.ADMIN_INITIAL_EMAIL?.toLowerCase()?.trim();
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (!adminEmail || !adminPassword) {
    return;
  }

  const users = await getCollectionDocs('users');
  const existing = users.find((u: any) => u.email?.toLowerCase() === adminEmail);
  if (!existing) {
    const orgId = process.env.ADMIN_INITIAL_ORG_ID || 'org_main';
    const orgName = process.env.ADMIN_INITIAL_ORG_NAME || 'People Tracking in Construction';

    const existingOrg = await getDocById('organizations', orgId);
    if (!existingOrg) {
      await upsertDoc('organizations', {
        id: orgId,
        name: orgName,
        slug: orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        status: 'active',
        plan: 'enterprise',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, orgId);
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const adminUser = {
      id: `usr_admin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      email: adminEmail,
      name: process.env.ADMIN_INITIAL_NAME || 'Systems Admin',
      role: 'admin',
      organizationId: orgId,
      isPlatformAdmin: true,
      passwordHash: hashedPassword,
      createdAt: new Date().toISOString()
    };
    await upsertDoc('users', adminUser, orgId);
    console.log(`[Auth Bootstrap] Initial admin user '${adminEmail}' initialized under organization '${orgId}'.`);
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

  const { email, password, name, role, organizationName, organizationId } = parseResult.data;
  const lowerEmail = email.toLowerCase();

  try {
    const users = await getCollectionDocs('users');
    const existing = users.find((u: any) => u.email?.toLowerCase() === lowerEmail);

    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const resolvedOrgId = organizationId || 'default';
    const resolvedOrgName = 'People Tracking in Construction';

    // Ensure default organization exists
    const defaultOrg = await getDocById('organizations', resolvedOrgId);
    if (!defaultOrg) {
      await upsertDoc('organizations', {
        id: resolvedOrgId,
        name: resolvedOrgName,
        slug: 'people-tracking-in-construction',
        status: 'active',
        plan: 'enterprise',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, resolvedOrgId);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const validRoles = ['admin', 'manager', 'operator', 'viewer'];
    const assignedRole = (role && validRoles.includes(role)) ? role : (lowerEmail.endsWith('@gaostaff.com') ? 'admin' : 'operator');

    const newUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      email: lowerEmail,
      name: name || lowerEmail.split('@')[0],
      role: assignedRole,
      organizationId: resolvedOrgId,
      passwordHash,
      tokenVersion: 1,
      createdAt: new Date().toISOString()
    };

    await upsertDoc('users', newUser, resolvedOrgId);

    // Sync user role in settings for permission matrix
    try {
      await upsertDoc('settings', {
        id: `user_role_${newUser.id}`,
        uid: newUser.id,
        email: newUser.email,
        displayName: newUser.name,
        role: newUser.role,
        organizationId: resolvedOrgId,
        updatedAt: new Date().toISOString()
      }, resolvedOrgId);
    } catch (e) {
      console.warn('[Auth] Could not sync user role setting:', e);
    }

    const token = generateToken({
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      organizationId: newUser.organizationId,
      tokenVersion: newUser.tokenVersion
    });

    await logAuditEvent({
      userId: newUser.id,
      userEmail: newUser.email,
      organizationId: resolvedOrgId,
      action: 'USER_REGISTER',
      resource: 'users',
      details: { role: assignedRole, organizationId: resolvedOrgId, organizationName: resolvedOrgName },
      ip: req.ip
    });

    const orgDoc = await getDocById('organizations', resolvedOrgId);

    return res.json({
      message: 'User registered successfully',
      user: sanitizeUser(newUser),
      organization: orgDoc || { id: resolvedOrgId, name: resolvedOrgName },
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
    }

    if (!isValid) {
      await logAuditEvent({
        userId: user.id,
        userEmail: lowerEmail,
        organizationId: user.organizationId || 'default',
        action: 'USER_LOGIN_FAILED',
        resource: 'auth',
        details: { reason: 'Invalid password' },
        ip: req.ip
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const tokenVersion = user.tokenVersion || 1;
    const organizationId = user.organizationId || 'default';
    user.organizationId = organizationId;
    
    // Update login audit/session metadata
    user.hasLoggedIn = true;
    user.lastLogin = new Date().toISOString();
    await upsertDoc('users', user, organizationId);

    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId,
      isPlatformAdmin: Boolean(user.isPlatformAdmin),
      tokenVersion
    });

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      organizationId,
      action: 'USER_LOGIN_SUCCESS',
      resource: 'auth',
      ip: req.ip
    });

    const orgDoc = await getDocById('organizations', organizationId);

    return res.json({
      message: 'Login successful',
      user: sanitizeUser(user),
      organization: orgDoc || { id: organizationId, name: orgDoc?.name || organizationId, status: 'active', plan: 'standard' },
      token
    });
  } catch (err: any) {
    console.error('[Auth Route] Login error:', err);
    return res.status(500).json({ error: 'Server error during login' });
  }
});

// POST /api/auth/firebase-login
authRouter.post('/firebase-login', authRateLimiter, async (req: Request, res: Response) => {
  const { idToken, role, organizationId } = req.body || {};
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
    const resolvedOrgId = organizationId || user?.organizationId || 'default';

    if (!user) {
      user = {
        id: firebaseUser.id || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        email: lowerEmail,
        name: firebaseUser.name || lowerEmail.split('@')[0] || 'Google User',
        displayName: firebaseUser.name || lowerEmail.split('@')[0] || 'Google User',
        role: assignedRole,
        organizationId: resolvedOrgId,
        tokenVersion: 1,
        createdAt: new Date().toISOString()
      };
    } else {
      user.role = role || user.role || assignedRole;
      user.organizationId = user.organizationId || resolvedOrgId;
      if (firebaseUser.name && !user.name) user.name = firebaseUser.name;
    }

    user.hasLoggedIn = true;
    user.lastLogin = new Date().toISOString();
    await upsertDoc('users', user, user.organizationId);

    try {
      await upsertDoc('settings', {
        id: `user_role_${user.id}`,
        uid: user.id,
        email: user.email,
        displayName: user.name || user.email?.split('@')[0],
        role: user.role,
        organizationId: user.organizationId,
        updatedAt: new Date().toISOString()
      }, user.organizationId);
    } catch (settingErr) {
      console.warn('[Auth Route] Failed to sync user_role setting:', settingErr);
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      tokenVersion: user.tokenVersion || 1
    });

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      organizationId: user.organizationId,
      action: 'FIREBASE_GOOGLE_LOGIN_SUCCESS',
      resource: 'auth',
      ip: req.ip
    });

    const orgDoc = await getDocById('organizations', user.organizationId);

    return res.json({
      message: 'Firebase authentication successful',
      user: sanitizeUser(user),
      organization: orgDoc || { id: user.organizationId, name: orgDoc?.name || user.organizationId, status: 'active', plan: 'standard' },
      token
    });
  } catch (err: any) {
    console.error('[Auth Route] Firebase login error:', err);
    return res.status(500).json({ error: 'Server error during Firebase authentication' });
  }
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.organizationId || 'default';
  const orgDoc = await getDocById('organizations', orgId);
  return res.json({
    user: req.user,
    organization: orgDoc || { id: orgId, name: orgDoc?.name || (orgId === 'default' || orgId === 'org_main' ? 'People Tracking in Construction' : orgId), status: 'active', plan: 'standard' }
  });
});

const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, 'New password must be at least 6 characters').optional()
});

// PUT /api/auth/me - Update user profile (name, password)
authRouter.put('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const parseResult = updateProfileSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid profile input',
      details: parseResult.error.issues
    });
  }

  const { name, currentPassword, newPassword } = parseResult.data;

  try {
    const allUsers = await getCollectionDocs('users');
    const userDoc = allUsers.find((u: any) => u.id === req.user?.id || u.email?.toLowerCase() === req.user?.email?.toLowerCase());

    if (!userDoc) {
      return res.status(404).json({ error: 'User profile not found in database' });
    }

    if (newPassword) {
      if (userDoc.passwordHash) {
        if (!currentPassword) {
          return res.status(400).json({ error: 'Current password is required to set a new password' });
        }
        const isMatch = await bcrypt.compare(currentPassword, userDoc.passwordHash);
        if (!isMatch) {
          return res.status(400).json({ error: 'Current password does not match' });
        }
      }
      userDoc.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    if (name && name.trim()) {
      userDoc.name = name.trim();
      userDoc.displayName = name.trim();
    }

    userDoc.updatedAt = new Date().toISOString();
    const targetOrg = userDoc.organizationId || req.user.organizationId || 'default';
    await upsertDoc('users', userDoc, targetOrg);

    const updatedToken = generateToken({
      id: userDoc.id,
      email: userDoc.email,
      name: userDoc.name,
      role: userDoc.role,
      organizationId: targetOrg,
      isPlatformAdmin: Boolean(userDoc.isPlatformAdmin),
      tokenVersion: userDoc.tokenVersion || 1
    });

    await logAuditEvent({
      userId: userDoc.id,
      userEmail: userDoc.email,
      organizationId: targetOrg,
      action: 'USER_PROFILE_UPDATED',
      resource: 'auth',
      details: {
        nameUpdated: Boolean(name),
        passwordUpdated: Boolean(newPassword)
      },
      ip: req.ip
    });

    return res.json({
      message: 'Profile updated successfully',
      user: sanitizeUser(userDoc),
      token: updatedToken
    });
  } catch (err: any) {
    console.error('[Auth Route] Update profile error:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /api/auth/organization
authRouter.get('/organization', requireAuth, async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.organizationId || 'default';
  const orgDoc = await getDocById('organizations', orgId, 'ALL');
  const org = orgDoc || { id: orgId, name: (orgId === 'demo' || orgId === 'default' || orgId === 'org_main') ? 'People Tracking in Construction' : orgId, status: 'active', plan: 'standard' };
  return res.json({ success: true, organization: org, ...org });
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
    const users = await getCollectionDocs('users', undefined, req.user.organizationId);
    const userDoc = users.find((u: any) => u.id === req.user?.id);

    if (userDoc) {
      const nextVersion = (userDoc.tokenVersion || 1) + 1;
      userDoc.tokenVersion = nextVersion;
      await upsertDoc('users', userDoc, req.user.organizationId);

      await logAuditEvent({
        userId: req.user.id,
        userEmail: req.user.email,
        organizationId: req.user.organizationId,
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
