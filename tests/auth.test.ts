import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { generateToken, verifyToken, verifyFirebaseTokenRS256, verifyTokenAsync, JWT_SECRET } from '../src/server/middleware/auth.js';
import { sanitizeUser } from '../src/server/routes/auth.js';

describe('Authentication & Token Utilities', () => {
  it('should generate a random per-boot JWT_SECRET if none is provided in env', () => {
    expect(typeof JWT_SECRET).toBe('string');
    expect(JWT_SECRET.length).toBeGreaterThanOrEqual(16);
    expect(JWT_SECRET).not.toBe('gao_people_tracking_jwt_secret_key_2026_prod');
  });

  it('should correctly hash and compare passwords with bcrypt', async () => {
    const rawPassword = 'SecureP@ssword2026';
    const hash = await bcrypt.hash(rawPassword, 10);

    expect(hash).not.toBe(rawPassword);
    
    const isValid = await bcrypt.compare(rawPassword, hash);
    expect(isValid).toBe(true);

    const isWrongValid = await bcrypt.compare('WrongPassword', hash);
    expect(isWrongValid).toBe(false);
  });

  it('should generate and verify signed JWT tokens', () => {
    const mockUser = {
      id: 'usr_999',
      email: 'admin@company.com',
      name: 'Site Admin',
      role: 'admin'
    };

    const token = generateToken(mockUser);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);

    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.id).toBe('usr_999');
    expect(decoded?.email).toBe('admin@company.com');
    expect(decoded?.role).toBe('admin');
  });

  it('should reject invalid or tampered JWT tokens', () => {
    const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.invalidsignature';
    const decoded = verifyToken(invalidToken);
    expect(decoded).toBeNull();
  });

  it('REGRESSION TEST: should reject forged Firebase tokens without valid RS256 signatures', async () => {
    // Construct a forged token claiming Firebase issuer and admin role signed with a fake secret or algorithm
    const forgedPayload = {
      iss: 'https://securetoken.google.com/gen-lang-client-0063942067',
      aud: 'gen-lang-client-0063942067',
      sub: 'forged_attacker_999',
      email: 'forged_admin@gaostaff.com',
      role: 'admin',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    // 1. Forged token using HS256 with arbitrary key
    const forgedHsToken = jwt.sign(forgedPayload, 'fake_attacker_secret');
    expect(verifyToken(forgedHsToken)).toBeNull();
    expect(await verifyFirebaseTokenRS256(forgedHsToken)).toBeNull();
    expect(await verifyTokenAsync(forgedHsToken)).toBeNull();

    // 2. Forged token using RS256 with non-existent or fake key ID (kid) signed with attacker's RSA key
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const forgedRsHeaderToken = jwt.sign(forgedPayload, privateKey, {
      algorithm: 'RS256',
      header: { alg: 'RS256', kid: 'fake_non_existent_kid_123' }
    });
    expect(verifyToken(forgedRsHeaderToken)).toBeNull();
    expect(await verifyFirebaseTokenRS256(forgedRsHeaderToken)).toBeNull();
    expect(await verifyTokenAsync(forgedRsHeaderToken)).toBeNull();
  });

  it('should sanitize user objects by stripping password fields', () => {
    const rawUser = {
      id: 'usr_123',
      email: 'user@domain.com',
      password: 'PlaintextPassword',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
      role: 'manager'
    };

    const clean = sanitizeUser(rawUser);
    expect(clean.id).toBe('usr_123');
    expect(clean.email).toBe('user@domain.com');
    expect(clean.role).toBe('manager');
    expect(clean.password).toBeUndefined();
    expect(clean.passwordHash).toBeUndefined();
  });
});
