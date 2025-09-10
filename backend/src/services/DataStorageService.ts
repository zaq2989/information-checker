import * as fs from 'fs';
import * as path from 'path';

// Safe logger with fallback to console
let safeLogger: Pick<Console, 'info' | 'warn' | 'error'> = console;
try {
  const indexModule = require('../index');
  if (indexModule && indexModule.logger) {
    safeLogger = indexModule.logger;
  }
} catch (e) {
  // Keep using console as fallback
}

interface StoredData {
  id: string;
  timestamp: Date;
  keyword?: string;
  type: 'search' | 'analysis' | 'cache';
  source: 'twitter-api' | 'mock';
  data: any;
  metadata?: {
    requestCount?: number;
    fromCache?: boolean;
    rateLimit?: any;
  };
}

export class DataStorageService {
  private static instance: DataStorageService;
  private dataDir: string;
  private searchesDir: string;
  private analysesDir: string;
  private cacheDir: string;
  private initialized: boolean = false;

  private constructor() {
    // Use absolute paths in container environment
    const baseDir = process.env.NODE_ENV === 'production' ? '/app/data' : path.join(process.cwd(), 'data');
    this.dataDir = baseDir;
    this.searchesDir = path.join(this.dataDir, 'searches');
    this.analysesDir = path.join(this.dataDir, 'analyses');
    this.cacheDir = path.join(this.dataDir, 'cache');
    
    // Don't create directories in constructor - call init() explicitly
  }

  static getInstance(): DataStorageService {
    if (!DataStorageService.instance) {
      DataStorageService.instance = new DataStorageService();
    }
    return DataStorageService.instance;
  }

  public init(): void {
    if (!this.initialized) {
      this.ensureDirectories();
      this.initialized = true;
    }
  }

  private ensureDirectories(): void {
    [this.dataDir, this.searchesDir, this.analysesDir, this.cacheDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        safeLogger.info(`Created directory: ${dir}`);
      }
    });
  }

  // Save search results
  async saveSearchData(keyword: string, data: any, source: 'twitter-api' | 'mock'): Promise<string> {
    try {
      const id = this.generateId();
      const timestamp = new Date();
      const filename = `search_${keyword.replace(/[^a-z0-9]/gi, '_')}_${timestamp.getTime()}.json`;
      const filepath = path.join(this.searchesDir, filename);
      
      const storedData: StoredData = {
        id,
        timestamp,
        keyword,
        type: 'search',
        source,
        data
      };
      
      await fs.promises.writeFile(filepath, JSON.stringify(storedData, null, 2));
      safeLogger.info(`Saved search data: ${filepath}`);
      
      // Also save a summary in index file
      await this.updateIndex('searches', {
        id,
        filename,
        keyword,
        timestamp,
        source,
        tweetCount: data.tweets?.length || 0
      });
      
      return id;
    } catch (error) {
      safeLogger.error('Failed to save search data:', error);
      throw error;
    }
  }

  // Save analysis results
  async saveAnalysisData(analysisId: string, data: any): Promise<void> {
    try {
      const timestamp = new Date();
      const filename = `analysis_${analysisId}_${timestamp.getTime()}.json`;
      const filepath = path.join(this.analysesDir, filename);
      
      const storedData: StoredData = {
        id: analysisId,
        timestamp,
        type: 'analysis',
        source: data.source || 'mock',
        data
      };
      
      await fs.promises.writeFile(filepath, JSON.stringify(storedData, null, 2));
      safeLogger.info(`Saved analysis data: ${filepath}`);
      
      // Update index
      await this.updateIndex('analyses', {
        id: analysisId,
        filename,
        timestamp,
        status: data.status,
        keyword: data.keyword
      });
    } catch (error) {
      safeLogger.error('Failed to save analysis data:', error);
      throw error;
    }
  }

  // Get search history
  async getSearchHistory(limit: number = 50): Promise<any[]> {
    try {
      const indexFile = path.join(this.searchesDir, 'index.json');
      
      if (!fs.existsSync(indexFile)) {
        return [];
      }
      
      const index = JSON.parse(await fs.promises.readFile(indexFile, 'utf-8'));
      return index.slice(-limit).reverse();
    } catch (error) {
      safeLogger.error('Failed to get search history:', error);
      return [];
    }
  }

  // Get specific search data
  async getSearchData(id: string): Promise<StoredData | null> {
    try {
      const files = await fs.promises.readdir(this.searchesDir);
      
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'index.json') {
          const filepath = path.join(this.searchesDir, file);
          const content = await fs.promises.readFile(filepath, 'utf-8');
          const data = JSON.parse(content);
          
          if (data.id === id) {
            return data;
          }
        }
      }
      
      return null;
    } catch (error) {
      safeLogger.error('Failed to get search data:', error);
      return null;
    }
  }

  // Get analysis history
  async getAnalysisHistory(limit: number = 50): Promise<any[]> {
    try {
      const indexFile = path.join(this.analysesDir, 'index.json');
      
      if (!fs.existsSync(indexFile)) {
        return [];
      }
      
      const index = JSON.parse(await fs.promises.readFile(indexFile, 'utf-8'));
      return index.slice(-limit).reverse();
    } catch (error) {
      safeLogger.error('Failed to get analysis history:', error);
      return [];
    }
  }

  // Clean old cache files (older than 24 hours)
  async cleanOldCache(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.cacheDir);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      for (const file of files) {
        const filepath = path.join(this.cacheDir, file);
        const stats = await fs.promises.stat(filepath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.promises.unlink(filepath);
          safeLogger.info(`Cleaned old cache file: ${file}`);
        }
      }
    } catch (error) {
      safeLogger.error('Failed to clean cache:', error);
    }
  }

  // Get storage statistics
  async getStorageStats(): Promise<{
    searches: number;
    analyses: number;
    cacheFiles: number;
    totalSize: number;
  }> {
    try {
      const searchFiles = (await fs.promises.readdir(this.searchesDir)).filter(f => f !== 'index.json');
      const analysisFiles = (await fs.promises.readdir(this.analysesDir)).filter(f => f !== 'index.json');
      const cacheFiles = await fs.promises.readdir(this.cacheDir);
      
      // Calculate total size
      let totalSize = 0;
      const allDirs = [this.searchesDir, this.analysesDir, this.cacheDir];
      
      for (const dir of allDirs) {
        const files = await fs.promises.readdir(dir);
        for (const file of files) {
          const stats = await fs.promises.stat(path.join(dir, file));
          totalSize += stats.size;
        }
      }
      
      return {
        searches: searchFiles.length,
        analyses: analysisFiles.length,
        cacheFiles: cacheFiles.length,
        totalSize: Math.round(totalSize / 1024) // in KB
      };
    } catch (error) {
      safeLogger.error('Failed to get storage stats:', error);
      return {
        searches: 0,
        analyses: 0,
        cacheFiles: 0,
        totalSize: 0
      };
    }
  }

  // Private helper methods
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  private async updateIndex(type: 'searches' | 'analyses', entry: any): Promise<void> {
    const dir = type === 'searches' ? this.searchesDir : this.analysesDir;
    const indexFile = path.join(dir, 'index.json');
    
    let index = [];
    
    if (fs.existsSync(indexFile)) {
      try {
        index = JSON.parse(await fs.promises.readFile(indexFile, 'utf-8'));
      } catch (error) {
        safeLogger.warn('Failed to read index file, creating new one');
      }
    }
    
    index.push(entry);
    
    // Keep only last 1000 entries
    if (index.length > 1000) {
      index = index.slice(-1000);
    }
    
    await fs.promises.writeFile(indexFile, JSON.stringify(index, null, 2));
  }

  // Export data as CSV
  async exportSearchesAsCSV(): Promise<string> {
    try {
      const history = await this.getSearchHistory(1000);
      
      if (history.length === 0) {
        return '';
      }
      
      const headers = ['ID', 'Keyword', 'Timestamp', 'Source', 'Tweet Count'];
      const rows = history.map(item => [
        item.id,
        item.keyword || '',
        item.timestamp,
        item.source,
        item.tweetCount || 0
      ]);
      
      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');
      
      const filename = `export_searches_${Date.now()}.csv`;
      const filepath = path.join(this.dataDir, filename);
      
      await fs.promises.writeFile(filepath, csv);
      safeLogger.info(`Exported searches to: ${filepath}`);
      
      return filepath;
    } catch (error) {
      safeLogger.error('Failed to export searches:', error);
      throw error;
    }
  }
}