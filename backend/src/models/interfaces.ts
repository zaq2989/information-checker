import { 
  Tweet, 
  SpreadData, 
  Account, 
  NetworkAnalysis, 
  BotDetectionResult, 
  CoordinationPattern, 
  InfluenceScore, 
  Anomaly, 
  SpreadEvent, 
  TimelineEvent 
} from './types';

export interface TweetCollector {
  collectTweetSpread(tweetId: string): Promise<SpreadData>;
  streamByKeywords(keywords: string[]): AsyncGenerator<Tweet>;
  collectHistoricalData(query: string, startDate: Date, endDate: Date): Promise<Tweet[]>;
  collectUserTimeline(userId: string, limit?: number): Promise<Tweet[]>;
  collectConversation(conversationId: string): Promise<Tweet[]>;
}

export interface AnalysisEngine {
  analyzeNetwork(spreadData: SpreadData, analysisId: string): Promise<NetworkAnalysis>;
  detectBots(accounts: Account[]): Promise<BotDetectionResult[]>;
  detectCoordination(activities: SpreadEvent[], analysisId: string): Promise<CoordinationPattern[]>;
  calculateInfluence(account: Account, context: SpreadData, networkAnalysis?: NetworkAnalysis): InfluenceScore;
  detectAnomalies(timeline: TimelineEvent[], analysisId: string): Promise<Anomaly[]>;
}

export interface DataStorage {
  saveTweet(tweet: Tweet): Promise<void>;
  saveAccount(account: Account): Promise<void>;
  saveSpreadEvent(event: SpreadEvent): Promise<void>;
  getTweet(id: string): Promise<Tweet | null>;
  getAccount(id: string): Promise<Account | null>;
  getSpreadEvents(tweetId: string): Promise<SpreadEvent[]>;
  saveAnalysisResult(result: any): Promise<string>;
  getAnalysisResult(id: string): Promise<any>;
}

export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  expire(key: string, ttl: number): Promise<void>;
}

export interface QueueService {
  addJob<T>(queue: string, data: T, options?: QueueOptions): Promise<string>;
  processQueue<T>(queue: string, processor: QueueProcessor<T>): void;
  getJobStatus(jobId: string): Promise<JobStatus>;
  removeJob(jobId: string): Promise<void>;
}

export interface QueueOptions {
  delay?: number;
  attempts?: number;
  backoff?: number;
  priority?: number;
  removeOnComplete?: boolean;
  removeOnFail?: boolean;
}

export interface QueueProcessor<T> {
  (job: Job<T>): Promise<void>;
}

export interface Job<T> {
  id: string;
  data: T;
  progress(percent: number): void;
  log(message: string): void;
}

export interface JobStatus {
  id: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  progress: number;
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RateLimiter {
  checkLimit(key: string): Promise<boolean>;
  consume(key: string, points?: number): Promise<void>;
  reset(key: string): Promise<void>;
  getStatus(key: string): Promise<RateLimitStatus>;
}

export interface RateLimitStatus {
  remaining: number;
  total: number;
  resetAt: Date;
}

export interface NotificationService {
  sendAlert(alert: Alert): Promise<void>;
  sendReport(report: Report): Promise<void>;
  subscribeToAlerts(userId: string, preferences: AlertPreferences): Promise<void>;
  unsubscribeFromAlerts(userId: string): Promise<void>;
}

export interface Alert {
  type: 'anomaly' | 'coordination' | 'bot_activity' | 'viral_spread';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  data: any;
  timestamp: Date;
}

export interface Report {
  id: string;
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  period: {
    start: Date;
    end: Date;
  };
  content: any;
  format: 'pdf' | 'json' | 'csv';
}

export interface AlertPreferences {
  email?: string;
  webhook?: string;
  types: string[];
  minSeverity: 'low' | 'medium' | 'high' | 'critical';
}

export interface Visualizations {
  NetworkGraph: any;
  SpreadTimeline: any;
  ActivityHeatmap: any;
  InfluenceTree: any;
}