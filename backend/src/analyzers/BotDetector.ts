// import * as tf from '@tensorflow/tfjs-node';
import { 
  Account, 
  BotDetectionResult, 
  BotSignal, 
  ProfileMetrics 
} from '../models';
import { Logger } from 'winston';
import { Pool } from 'pg';

export class BotDetector {
  private model: any | null = null;
  private logger: Logger;
  private pgPool: Pool;
  private readonly thresholds = {
    bot: 0.8,
    cyborg: 0.6,
    uncertain: 0.4
  };

  constructor(logger: Logger, pgPool: Pool) {
    this.logger = logger;
    this.pgPool = pgPool;
  }

  async initialize(): Promise<void> {
    try {
      // this.model = await this.buildModel();
      this.logger.info('Bot detection model initialized (using rule-based approach)');
    } catch (error) {
      this.logger.error('Failed to initialize bot detection model:', error);
    }
  }

  async detectBots(accounts: Account[]): Promise<BotDetectionResult[]> {
    const results: BotDetectionResult[] = [];

    for (const account of accounts) {
      const result = await this.analyzeAccount(account);
      results.push(result);
      
      // Store bot detection results in database
      await this.storeBotDetectionResult(account, result);
    }

    return results;
  }
  
  private async storeBotDetectionResult(account: Account, result: BotDetectionResult): Promise<void> {
    try {
      // Update user bot score
      await this.pgPool.query(
        'UPDATE users SET bot_score = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [result.botProbability, account.id]
      );
      
      // Store bot signals
      for (const signal of result.signals) {
        await this.pgPool.query(
          `INSERT INTO bot_signals (user_id, signal_type, signal_value, confidence)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, signal_type) DO UPDATE
           SET signal_value = $3, confidence = $4, detected_at = CURRENT_TIMESTAMP`,
          [account.id, signal.type, signal.value, signal.weight]
        );
      }
    } catch (error) {
      this.logger.error('Failed to store bot detection results:', error);
    }
  }

  private async analyzeAccount(account: Account): Promise<BotDetectionResult> {
    const signals = this.extractSignals(account);
    const features = this.prepareFeatures(account, signals);
    const probability = await this.calculateBotProbability(features);
    const classification = this.classify(probability);

    return {
      accountId: account.id,
      botProbability: probability,
      signals,
      classification,
      confidence: this.calculateConfidence(signals, probability)
    };
  }

  private extractSignals(account: Account): BotSignal[] {
    const signals: BotSignal[] = [];
    const metrics = this.calculateMetrics(account);

    // Account age vs follower count
    const accountAgeScore = this.accountAgeAnalysis(account);
    signals.push({
      type: 'account_age',
      value: accountAgeScore,
      weight: 0.15,
      description: 'Account age relative to follower count'
    });

    // Tweet frequency
    const tweetFrequencyScore = this.tweetFrequencyAnalysis(metrics);
    signals.push({
      type: 'tweet_frequency',
      value: tweetFrequencyScore,
      weight: 0.20,
      description: 'Abnormal tweeting patterns'
    });

    // Follow/follower ratio
    const ratioScore = this.followRatioAnalysis(account);
    signals.push({
      type: 'follow_ratio',
      value: ratioScore,
      weight: 0.15,
      description: 'Following to follower ratio'
    });

    // Profile completeness
    const profileScore = this.profileCompletenessAnalysis(account);
    signals.push({
      type: 'profile_completeness',
      value: profileScore,
      weight: 0.10,
      description: 'Profile information completeness'
    });

    // Default profile image
    const defaultImageScore = account.profileImageUrl?.includes('default_profile') ? 1.0 : 0.0;
    signals.push({
      type: 'default_image',
      value: defaultImageScore,
      weight: 0.10,
      description: 'Uses default profile image'
    });

    // Username patterns
    const usernameScore = this.usernamePatternAnalysis(account.username);
    signals.push({
      type: 'username_pattern',
      value: usernameScore,
      weight: 0.15,
      description: 'Suspicious username patterns'
    });

    // Engagement rate
    const engagementScore = this.engagementAnalysis(metrics);
    signals.push({
      type: 'engagement_rate',
      value: engagementScore,
      weight: 0.15,
      description: 'Abnormal engagement patterns'
    });

    return signals;
  }

  private calculateMetrics(account: Account): ProfileMetrics {
    const accountAgeInDays = Math.max(
      1,
      (Date.now() - account.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    return {
      averageTweetsPerDay: account.tweetCount / accountAgeInDays,
      accountAgeInDays,
      followersToFollowingRatio: account.followersCount / Math.max(1, account.followingCount),
      engagementRate: 0, // Would need tweet data to calculate properly
      hashtagDiversity: 0,
      urlUsageRate: 0,
      replyRate: 0,
      retweetRate: 0
    };
  }

  private accountAgeAnalysis(account: Account): number {
    const ageInDays = (Date.now() - account.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    
    // New accounts with many followers are suspicious
    if (ageInDays < 30 && account.followersCount > 1000) return 0.9;
    if (ageInDays < 90 && account.followersCount > 5000) return 0.7;
    if (ageInDays < 180 && account.followersCount > 10000) return 0.5;
    
    // Very old accounts with few followers might be sleeper bots
    if (ageInDays > 365 * 3 && account.followersCount < 50) return 0.6;
    
    return 0.1;
  }

  private tweetFrequencyAnalysis(metrics: ProfileMetrics): number {
    const tweetsPerDay = metrics.averageTweetsPerDay;
    
    // Extremely high tweet frequency
    if (tweetsPerDay > 100) return 1.0;
    if (tweetsPerDay > 50) return 0.8;
    if (tweetsPerDay > 30) return 0.6;
    
    // Suspiciously consistent frequency (would need more data)
    if (tweetsPerDay > 10 && tweetsPerDay < 15) return 0.4;
    
    return 0.1;
  }

  private followRatioAnalysis(account: Account): number {
    const ratio = account.followingCount / Math.max(1, account.followersCount);
    
    // Following many more than followers
    if (ratio > 50) return 1.0;
    if (ratio > 20) return 0.8;
    if (ratio > 10) return 0.6;
    if (ratio > 5) return 0.4;
    
    // Suspicious equal following/followers
    if (Math.abs(account.followingCount - account.followersCount) < 10 && 
        account.followingCount > 100) return 0.7;
    
    return 0.1;
  }

  private profileCompletenessAnalysis(account: Account): number {
    let score = 0;
    let factors = 0;
    
    if (!account.description || account.description.length < 10) {
      score += 0.3;
      factors++;
    }
    
    if (!account.location) {
      score += 0.2;
      factors++;
    }
    
    if (!account.profileImageUrl || account.profileImageUrl.includes('default')) {
      score += 0.3;
      factors++;
    }
    
    if (account.displayName === account.username) {
      score += 0.2;
      factors++;
    }
    
    return factors > 0 ? score / factors : 0;
  }

  private usernamePatternAnalysis(username: string): number {
    let score = 0;
    
    // Random string of characters
    if (/^[a-zA-Z]{8,}[0-9]{4,}$/.test(username)) score += 0.4;
    
    // Too many numbers
    const digitRatio = (username.match(/[0-9]/g) || []).length / username.length;
    if (digitRatio > 0.5) score += 0.3;
    
    // Common bot patterns
    if (username.includes('bot') || username.includes('Bot')) score += 0.2;
    if (/[0-9]{8,}/.test(username)) score += 0.3;
    
    // Random uppercase/lowercase
    if (/[a-z][A-Z][a-z][A-Z]/.test(username)) score += 0.2;
    
    return Math.min(1.0, score);
  }

  private engagementAnalysis(metrics: ProfileMetrics): number {
    // This would need actual tweet data to properly analyze
    // For now, return a placeholder
    return 0.3;
  }

  private prepareFeatures(account: Account, signals: BotSignal[]): number[] {
    const metrics = this.calculateMetrics(account);
    
    return [
      metrics.accountAgeInDays / 365, // Normalize to years
      Math.min(metrics.averageTweetsPerDay / 100, 1), // Cap at 100 tweets/day
      Math.min(account.followersCount / 10000, 1), // Cap at 10k
      Math.min(account.followingCount / 10000, 1), // Cap at 10k
      Math.min(metrics.followersToFollowingRatio / 10, 1), // Cap ratio at 10
      account.verified ? 0 : 1,
      ...signals.map(s => s.value)
    ];
  }

  private async calculateBotProbability(features: number[]): Promise<number> {
    // Always use rule-based calculation for now
    return this.fallbackCalculation(features);
  }

  private fallbackCalculation(features: number[]): number {
    // Simple weighted average as fallback
    const weights = [0.1, 0.2, 0.05, 0.05, 0.1, 0.2, ...Array(features.length - 6).fill(0.3 / (features.length - 6))];
    let sum = 0;
    
    for (let i = 0; i < features.length; i++) {
      sum += features[i] * weights[i];
    }
    
    return Math.min(1.0, Math.max(0.0, sum));
  }

  private classify(probability: number): 'human' | 'bot' | 'cyborg' | 'uncertain' {
    if (probability >= this.thresholds.bot) return 'bot';
    if (probability >= this.thresholds.cyborg) return 'cyborg';
    if (probability >= this.thresholds.uncertain) return 'uncertain';
    return 'human';
  }

  private calculateConfidence(signals: BotSignal[], probability: number): number {
    // Higher confidence when signals agree with overall probability
    const signalAverage = signals.reduce((sum, signal) => sum + signal.value * signal.weight, 0);
    const agreement = 1 - Math.abs(signalAverage - probability);
    
    // Also consider extremity of the probability
    const extremity = Math.abs(probability - 0.5) * 2;
    
    return (agreement * 0.7 + extremity * 0.3);
  }

  private async buildModel(): Promise<any> {
    // Placeholder for TensorFlow model
    // Will be implemented when TensorFlow is properly configured
    return null;
    /*
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [13], // Number of features
          units: 64,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
        }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({
          units: 32,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 16,
          activation: 'relu'
        }),
        tf.layers.dense({
          units: 1,
          activation: 'sigmoid'
        })
      ]
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy']
    });

    return model;
    */
  }
}