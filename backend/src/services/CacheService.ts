import { createClient, RedisClientType } from 'redis';
import { CacheService as ICacheService } from '../models';
import { Logger } from 'winston';

export class CacheService implements ICacheService {
  private client: RedisClientType;
  private logger: Logger;
  private defaultTTL: number = 3600; // 1 hour

  constructor(logger: Logger, redisUrl?: string) {
    this.logger = logger;
    this.client = createClient({
      url: redisUrl || 'redis://localhost:6379'
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis Client Error', err);
    });

    this.client.on('connect', () => {
      this.logger.info('Connected to Redis');
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) return null;
      
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const stringValue = JSON.stringify(value);
      const options = ttl ? { EX: ttl } : { EX: this.defaultTTL };
      
      await this.client.set(key, stringValue, options);
    } catch (error) {
      this.logger.error(`Cache set error for key ${key}:`, error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.error(`Cache delete error for key ${key}:`, error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  async expire(key: string, ttl: number): Promise<void> {
    try {
      await this.client.expire(key, ttl);
    } catch (error) {
      this.logger.error(`Cache expire error for key ${key}:`, error);
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      this.logger.error(`Cache keys error for pattern ${pattern}:`, error);
      return [];
    }
  }

  async flushAll(): Promise<void> {
    try {
      await this.client.flushAll();
      this.logger.info('Cache flushed');
    } catch (error) {
      this.logger.error('Cache flush error:', error);
    }
  }
}