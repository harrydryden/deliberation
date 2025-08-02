import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
    blocked: boolean;
    blockUntil?: number;
  };
}

const store: RateLimitStore = {};
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5; // Max 5 auth attempts per window
const BLOCK_DURATION = 30 * 60 * 1000; // 30 minutes block
const EXPONENTIAL_BACKOFF_BASE = 2;

function getClientKey(request: FastifyRequest): string {
  // Use IP address as the primary identifier
  const ip = request.ip || request.socket.remoteAddress || 'unknown';
  return `auth_limit:${ip}`;
}

function isBlocked(key: string): boolean {
  const record = store[key];
  if (!record) return false;
  
  if (record.blocked && record.blockUntil && Date.now() < record.blockUntil) {
    return true;
  }
  
  // Clear block if expired
  if (record.blocked && record.blockUntil && Date.now() >= record.blockUntil) {
    delete store[key];
    return false;
  }
  
  return false;
}

function incrementAttempts(key: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = store[key] || { count: 0, resetTime: now + RATE_LIMIT_WINDOW, blocked: false };
  
  // Check if blocked
  if (isBlocked(key)) {
    return { 
      allowed: false, 
      retryAfter: Math.ceil((record.blockUntil! - now) / 1000) 
    };
  }
  
  // Reset if window expired
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + RATE_LIMIT_WINDOW;
    record.blocked = false;
    delete record.blockUntil;
  }
  
  record.count++;
  store[key] = record;
  
  if (record.count > MAX_ATTEMPTS) {
    // Apply exponential backoff
    const blockMultiplier = Math.min(Math.pow(EXPONENTIAL_BACKOFF_BASE, record.count - MAX_ATTEMPTS - 1), 8);
    const blockDuration = BLOCK_DURATION * blockMultiplier;
    
    record.blocked = true;
    record.blockUntil = now + blockDuration;
    
    return { 
      allowed: false, 
      retryAfter: Math.ceil(blockDuration / 1000) 
    };
  }
  
  return { allowed: true };
}

function recordSuccess(key: string): void {
  // Reset the count on successful authentication
  delete store[key];
}

function recordFailure(key: string): { allowed: boolean; retryAfter?: number } {
  return incrementAttempts(key);
}

export function authRateLimiter(fastify: FastifyInstance) {
  return async function rateLimitMiddleware(request: FastifyRequest, reply: FastifyReply) {
    const key = getClientKey(request);
    
    // Check if already blocked
    if (isBlocked(key)) {
      const record = store[key];
      const retryAfter = Math.ceil((record.blockUntil! - Date.now()) / 1000);
      
      reply.status(429).send({
        error: 'Too many authentication attempts',
        retryAfter,
        message: `Account temporarily locked. Try again in ${Math.ceil(retryAfter / 60)} minutes.`
      });
      return;
    }
    
    // Store the key in request for later use
    (request as any).rateLimitKey = key;
  };
}

export { recordSuccess, recordFailure };