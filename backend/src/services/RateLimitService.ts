import { logger } from '../index';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  cacheDurationMs: number;
}

interface RequestRecord {
  count: number;
  firstRequest: number;
  lastRequest: number;
  cache: Map<string, { data: any; timestamp: number }>;
}

export class RateLimitService {
  private static instance: RateLimitService;
  private records: Map<string, RequestRecord> = new Map();
  
  // Twitter API Free tier limits
  private config: RateLimitConfig = {
    maxRequests: 10,        // Max 10 requests
    windowMs: 15 * 60 * 1000,  // per 15 minutes
    cacheDurationMs: 5 * 60 * 1000  // Cache for 5 minutes
  };

  private constructor() {}

  static getInstance(): RateLimitService {
    if (!RateLimitService.instance) {
      RateLimitService.instance = new RateLimitService();
    }
    return RateLimitService.instance;
  }

  // Check if request can be made
  canMakeRequest(endpoint: string): boolean {
    const record = this.records.get(endpoint);
    
    if (!record) {
      return true;
    }
    
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    // Reset if outside window
    if (record.firstRequest < windowStart) {
      record.count = 0;
      record.firstRequest = now;
      return true;
    }
    
    return record.count < this.config.maxRequests;
  }

  // Record a request
  recordRequest(endpoint: string): void {
    const now = Date.now();
    let record = this.records.get(endpoint);
    
    if (!record) {
      record = {
        count: 0,
        firstRequest: now,
        lastRequest: now,
        cache: new Map()
      };
      this.records.set(endpoint, record);
    }
    
    const windowStart = now - this.config.windowMs;
    
    // Reset if outside window
    if (record.firstRequest < windowStart) {
      record.count = 1;
      record.firstRequest = now;
      record.lastRequest = now;
      // Clear old cache entries
      record.cache.clear();
    } else {
      record.count++;
      record.lastRequest = now;
    }
    
    logger.info(`API Request recorded: ${endpoint} (${record.count}/${this.config.maxRequests} in window)`);
  }

  // Get cached response if available
  getCachedResponse(endpoint: string, query: string): any | null {
    const record = this.records.get(endpoint);
    
    if (!record) {
      return null;
    }
    
    const cached = record.cache.get(query);
    
    if (!cached) {
      return null;
    }
    
    const now = Date.now();
    
    // Check if cache is still valid
    if (now - cached.timestamp > this.config.cacheDurationMs) {
      record.cache.delete(query);
      return null;
    }
    
    logger.info(`Returning cached response for: ${endpoint} - ${query}`);
    return cached.data;
  }

  // Cache a response
  cacheResponse(endpoint: string, query: string, data: any): void {
    let record = this.records.get(endpoint);
    
    if (!record) {
      record = {
        count: 0,
        firstRequest: Date.now(),
        lastRequest: Date.now(),
        cache: new Map()
      };
      this.records.set(endpoint, record);
    }
    
    record.cache.set(query, {
      data,
      timestamp: Date.now()
    });
    
    // Limit cache size
    if (record.cache.size > 100) {
      const firstKey = record.cache.keys().next().value;
      record.cache.delete(firstKey);
    }
  }

  // Get remaining requests in current window
  getRemainingRequests(endpoint: string): number {
    const record = this.records.get(endpoint);
    
    if (!record) {
      return this.config.maxRequests;
    }
    
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    if (record.firstRequest < windowStart) {
      return this.config.maxRequests;
    }
    
    return Math.max(0, this.config.maxRequests - record.count);
  }

  // Get time until rate limit resets
  getResetTime(endpoint: string): number {
    const record = this.records.get(endpoint);
    
    if (!record) {
      return 0;
    }
    
    const resetTime = record.firstRequest + this.config.windowMs;
    const now = Date.now();
    
    return Math.max(0, resetTime - now);
  }

  // Get rate limit info
  getRateLimitInfo(endpoint: string): {
    remaining: number;
    total: number;
    resetIn: number;
  } {
    return {
      remaining: this.getRemainingRequests(endpoint),
      total: this.config.maxRequests,
      resetIn: this.getResetTime(endpoint)
    };
  }
}