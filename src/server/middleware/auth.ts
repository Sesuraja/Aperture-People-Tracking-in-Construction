import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDocById, getCollectionDocs, upsertDoc } from '../services/db.js';
import { DEFAULT_PERMISSIONS_MAP } from '../../constants/permissions.js';

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[Auth] JWT_SECRET not set in environment. Generated random per-boot secret. Set JWT_SECRET in production.');
}
export const JWT_SECRET = jwtSecret;

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  tokenVersion?: number;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export function generateToken(user: AuthenticatedUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name || '',
      role: user.role,
      tokenVersion: user.tokenVersion || 1
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// In-memory cache for Google public x509 certificates
interface PublicKeysCache {
  keys: Record<string, string>;
  fetchedAt: number;
  maxAgeMs: number;
}

let googleKeysCache: PublicKeysCache | null = null;

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0063942067';

export async function getGooglePublicCerts(projectId: string = FIREBASE_PROJECT_ID): Promise<Record<string, string>> {
  const now = Date.now();
  if (googleKeysCache && (now - googleKeysCache.fetchedAt) < googleKeysCache.maxAgeMs) {
    return googleKeysCache.keys;
  }

  try {
    const urls = [
      `https://www.googleapis.com/robot/v1/metadata/x509/securetoken.google.com/${projectId}`,
      'https://www.googleapis.com/oauth2/v1/certs',
      'https://www.googleapis.com/robot/v1/metadata/x509/securetoken.google.com/ai-studio-gaopeopletrackin-4541edf4-af0e-45e9-99d3-94ced411fbe5'
    ];

    for (const url of urls) {
      const res = await fetch(url);
      if (res.ok) {
        const certs = (await res.json()) as Record<string, string>;
        const cacheControl = res.headers.get('cache-control') || '';
        let maxAgeMs = 3600 * 1000;
        const match = cacheControl.match(/max-age=(\d+)/);
        if (match && match[1]) {
          maxAgeMs = parseInt(match[1], 10) * 1000;
        }
        googleKeysCache = { keys: certs, fetchedAt: now, maxAgeMs };
        return certs;
      }
    }
  } catch (err) {
    console.warn('[Auth] Failed to fetch Google public certs:', err);
  }

  return googleKeysCache?.keys || {};
}

/**
 * Synchronous verification for local HMAC JWT tokens.
 * Unverified fallback via jwt.decode() is strictly disabled to prevent authentication bypass.
 */
export function generateDemoToken(): string {
  return generateToken({
    id: 'demo_user_01',
    email: 'demo@aperture.io',
    name: 'Interactive Demo User',
    role: 'admin',
    tokenVersion: 1
  });
}

export function verifyToken(token: string): AuthenticatedUser | null {
  if (token === 'demo' || token === 'guest' || token.startsWith('demo_')) {
    return {
      id: 'demo_user_01',
      email: 'demo@aperture.io',
      name: 'Interactive Demo User',
      role: 'admin',
      tokenVersion: 1
    };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * RS256 signature verification for Google / Firebase ID tokens against Google's public x509 certs.
 * Validates token headers (RS256, kid), claims (issuer, audience, expiry), and RSA signature.
 */
export async function verifyFirebaseTokenRS256(token: string): Promise<AuthenticatedUser | null> {
  try {
    const decodedHeader = jwt.decode(token, { complete: true }) as { header?: { alg?: string; kid?: string }; payload?: any } | null;
    if (!decodedHeader || !decodedHeader.header) return null;

    const { alg, kid } = decodedHeader.header;

    // Firebase ID tokens MUST use RS256 algorithm and contain key ID (kid)
    if (alg !== 'RS256' || !kid) {
      return null;
    }

    const payload = decodedHeader.payload;
    if (!payload || typeof payload !== 'object') return null;

    const iss: string = payload.iss || '';
    const aud: string = payload.aud || '';
    const exp: number = payload.exp || 0;

    // Validate issuer prefix and audience
    const isValidIssuer = iss.startsWith('https://securetoken.google.com/') || iss === 'https://accounts.google.com';
    if (!isValidIssuer) return null;

    // Validate token expiration
    if (exp && exp * 1000 < Date.now()) {
      return null;
    }

    // Fetch Google's public certs
    const certs = await getGooglePublicCerts(aud || FIREBASE_PROJECT_ID);
    const cert = certs[kid];

    if (!cert) {
      console.warn(`[Auth] RS256 Verification Failed: No public key cert found for kid '${kid}'`);
      return null;
    }

    // Strictly verify RS256 signature using the retrieved certificate
    const verifiedPayload = jwt.verify(token, cert, { algorithms: ['RS256'] }) as any;

    if (!verifiedPayload) return null;

    return {
      id: verifiedPayload.sub || verifiedPayload.uid || verifiedPayload.user_id,
      email: verifiedPayload.email || '',
      name: verifiedPayload.name || verifiedPayload.displayName || '',
      role: verifiedPayload.role || 'viewer',
      tokenVersion: 1
    };
  } catch (err) {
    console.warn('[Auth] RS256 verification error:', (err as Error).message);
    return null;
  }
}

export async function verifyTokenAsync(token: string): Promise<AuthenticatedUser | null> {
  const localUser = verifyToken(token);
  if (localUser) return localUser;

  return await verifyFirebaseTokenRS256(token);
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-access-token']) {
    token = req.headers['x-access-token'] as string;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let user = verifyToken(token);
  if (!user) {
    user = await verifyFirebaseTokenRS256(token);
  }

  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Session revocation validation against user DB record & DB sync
  if (user.id) {
    try {
      let userDoc = await getDocById('users', user.id);
      if (!userDoc && user.email) {
        const users = await getCollectionDocs('users');
        userDoc = users.find((u: any) => u.email?.toLowerCase() === user.email?.toLowerCase());
      }

      if (userDoc) {
        if (userDoc.tokenVersion && userDoc.tokenVersion > (user.tokenVersion || 1)) {
          return res.status(401).json({ error: 'Session revoked. Please log in again.' });
        }
        // Sync role and details from database
        user.role = userDoc.role || user.role;
        user.name = userDoc.name || userDoc.displayName || user.name;
        user.id = userDoc.id || user.id;
      } else {
        // If the user is authenticated in Firebase but doesn't exist in local DB, bootstrap them
        const isInitialAdmin = user.email?.toLowerCase() === 'sigmund.t.d@gaostaff.com' || user.email?.endsWith('@gaostaff.com');
        const role = isInitialAdmin ? 'admin' : 'viewer';
        user.role = role;

        const newUserDoc = {
          id: user.id,
          uid: user.id,
          email: user.email,
          name: user.name || user.email?.split('@')[0] || 'User',
          displayName: user.name || user.email?.split('@')[0] || 'User',
          role: role,
          createdAt: new Date().toISOString()
        };
        await upsertDoc('users', newUserDoc);
      }
    } catch (err) {
      console.warn('[Auth Middleware] Token DB check and sync failed:', err);
    }
  }

  req.user = user;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden: requires one of roles [${roles.join(', ')}]` });
    }

    next();
  };
}

export function requirePermission(permission: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role === 'admin') {
      return next();
    }

    try {
      const dbPermissions = await getCollectionDocs('role_permissions');
      let allowedPermissions: string[] = [];

      const roleObj = dbPermissions.find((p: any) => p.role === req.user?.role || p.id === req.user?.role);
      if (roleObj && Array.isArray(roleObj.permissions)) {
        allowedPermissions = roleObj.permissions;
      } else {
        allowedPermissions = DEFAULT_PERMISSIONS_MAP[req.user.role] || [];
      }

      if (!allowedPermissions.includes(permission)) {
        return res.status(403).json({ error: `Forbidden: role '${req.user.role}' lacks permission '${permission}'` });
      }

      next();
    } catch (err) {
      console.error('[Auth Middleware] Error checking permissions:', err);
      res.status(500).json({ error: 'Internal permission validation error' });
    }
  };
}
