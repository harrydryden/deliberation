import { FastifyInstance } from 'fastify';

interface AccessCodeAttempt {
  code: string;
  timestamp: number;
  ip: string;
}

interface SecurityMetrics {
  attempts: AccessCodeAttempt[];
  suspiciousIPs: Set<string>;
  lastCleanup: number;
}

const securityMetrics: SecurityMetrics = {
  attempts: [],
  suspiciousIPs: new Set(),
  lastCleanup: Date.now()
};

const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
const SUSPICIOUS_THRESHOLD = 10; // 10 different codes from same IP in 1 hour
const WINDOW_SIZE = 60 * 60 * 1000; // 1 hour window

export function initAccessCodeSecurity(fastify: FastifyInstance) {
  // Periodic cleanup of old attempts
  setInterval(() => {
    cleanupOldAttempts();
  }, CLEANUP_INTERVAL);
}

function cleanupOldAttempts() {
  const cutoff = Date.now() - WINDOW_SIZE;
  securityMetrics.attempts = securityMetrics.attempts.filter(
    attempt => attempt.timestamp > cutoff
  );
  securityMetrics.lastCleanup = Date.now();
  
  // Recalculate suspicious IPs
  recalculateSuspiciousIPs();
}

function recalculateSuspiciousIPs() {
  const ipAttempts = new Map<string, Set<string>>();
  
  securityMetrics.attempts.forEach(attempt => {
    if (!ipAttempts.has(attempt.ip)) {
      ipAttempts.set(attempt.ip, new Set());
    }
    ipAttempts.get(attempt.ip)!.add(attempt.code);
  });
  
  securityMetrics.suspiciousIPs.clear();
  ipAttempts.forEach((codes, ip) => {
    if (codes.size >= SUSPICIOUS_THRESHOLD) {
      securityMetrics.suspiciousIPs.add(ip);
    }
  });
}

export function recordAccessCodeAttempt(code: string, ip: string): void {
  // Clean up if needed
  if (Date.now() - securityMetrics.lastCleanup > CLEANUP_INTERVAL) {
    cleanupOldAttempts();
  }
  
  securityMetrics.attempts.push({
    code,
    timestamp: Date.now(),
    ip
  });
  
  // Check if this IP becomes suspicious
  const recentAttempts = securityMetrics.attempts.filter(
    attempt => attempt.ip === ip && 
    attempt.timestamp > Date.now() - WINDOW_SIZE
  );
  
  const uniqueCodes = new Set(recentAttempts.map(a => a.code));
  if (uniqueCodes.size >= SUSPICIOUS_THRESHOLD) {
    securityMetrics.suspiciousIPs.add(ip);
  }
}

export function isSuspiciousIP(ip: string): boolean {
  return securityMetrics.suspiciousIPs.has(ip);
}

export function getSecurityMetrics() {
  return {
    totalAttempts: securityMetrics.attempts.length,
    suspiciousIPCount: securityMetrics.suspiciousIPs.size,
    recentAttempts: securityMetrics.attempts.filter(
      attempt => attempt.timestamp > Date.now() - (15 * 60 * 1000) // Last 15 minutes
    ).length
  };
}

export function validateAccessCodeFormat(code: string): { valid: boolean; reason?: string } {
  if (!code) {
    return { valid: false, reason: 'Access code is required' };
  }
  
  if (code.length < 8 || code.length > 15) {
    return { valid: false, reason: 'Invalid access code format' };
  }
  
  if (!/^[A-Z0-9]+$/.test(code)) {
    return { valid: false, reason: 'Invalid access code format' };
  }
  
  // Check for obviously fake codes
  const suspiciousPatterns = [
    /^(.)\1{7,}$/, // Repeated characters
    /^(01|12|23|34|45|56|67|78|89|90){4,}$/, // Sequential numbers
    /^(ABC|123|TEST|FAKE|NULL|ADMIN){2,}$/i // Common test patterns
  ];
  
  if (suspiciousPatterns.some(pattern => pattern.test(code))) {
    return { valid: false, reason: 'Invalid access code format' };
  }
  
  return { valid: true };
}