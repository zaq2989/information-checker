import { RateLimiter as IRateLimiter, RateLimitStatus } from '../models';

export class RateLimiter implements IRateLimiter {
  private limits: Map<string, RateLimitInfo> = new Map();
  private defaultLimit: number = 100;
  private windowMs: number = 15 * 60 * 1000; // 15 minutes

  constructor(defaultLimit?: number, windowMs?: number) {
    if (defaultLimit) this.defaultLimit = defaultLimit;
    if (windowMs) this.windowMs = windowMs;
    
    this.initializeLimits();
  }

  private initializeLimits() {
    this.limits.set('twitter-api', {
      total: 300,
      remaining: 300,
      resetAt: new Date(Date.now() + this.windowMs),
      windowMs: this.windowMs
    });
  }

  async checkLimit(key: string): Promise<boolean> {
    const limit = this.limits.get(key) || this.createLimit(key);
    
    if (limit.resetAt < new Date()) {
      this.resetLimit(key);
      return true;
    }
    
    return limit.remaining > 0;
  }

  async consume(key: string, points: number = 1): Promise<void> {
    const limit = this.limits.get(key) || this.createLimit(key);
    
    if (limit.resetAt < new Date()) {
      this.resetLimit(key);
    }
    
    if (limit.remaining < points) {
      const waitTime = limit.resetAt.getTime() - Date.now();
      throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds`);
    }
    
    limit.remaining -= points;
    this.limits.set(key, limit);
  }

  async reset(key: string): Promise<void> {
    this.resetLimit(key);
  }

  async getStatus(key: string): Promise<RateLimitStatus> {
    const limit = this.limits.get(key) || this.createLimit(key);
    
    return {
      remaining: limit.remaining,
      total: limit.total,
      resetAt: limit.resetAt
    };
  }

  private createLimit(key: string): RateLimitInfo {
    const limit: RateLimitInfo = {
      total: this.defaultLimit,
      remaining: this.defaultLimit,
      resetAt: new Date(Date.now() + this.windowMs),
      windowMs: this.windowMs
    };
    
    this.limits.set(key, limit);
    return limit;
  }

  private resetLimit(key: string): void {
    const limit = this.limits.get(key);
    if (limit) {
      limit.remaining = limit.total;
      limit.resetAt = new Date(Date.now() + limit.windowMs);
      this.limits.set(key, limit);
    }
  }
}

interface RateLimitInfo {
  total: number;
  remaining: number;
  resetAt: Date;
  windowMs: number;
}