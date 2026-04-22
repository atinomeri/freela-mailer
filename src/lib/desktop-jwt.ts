/**
 * JWT utilities for desktop app authentication.
 * Separate from NextAuth — issues Bearer tokens for the desktop email client.
 */

import jwt from "jsonwebtoken";
import { createHash, randomUUID } from "crypto";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// ── Access Token (short-lived, 15 min) ──────────────────────────

export interface AccessTokenPayload {
  sub: string; // userId
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, requireEnv("JWT_ACCESS_SECRET"), {
    expiresIn: "15m",
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, requireEnv("JWT_ACCESS_SECRET")) as AccessTokenPayload;
}

// ── Refresh Token (7 days, with JTI for rotation) ──

export interface RefreshTokenPayload {
  sub: string; // userId
  jti: string; // unique token ID
}

export function signRefreshToken(userId: string): { token: string; jti: string } {
  const jti = randomUUID();
  const token = jwt.sign({ sub: userId, jti }, requireEnv("JWT_REFRESH_SECRET"), {
    expiresIn: "7d",
  });
  return { token, jti };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, requireEnv("JWT_REFRESH_SECRET")) as RefreshTokenPayload;
}

// ── Token hashing (SHA-256, for DB storage) ─────────────────────

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
