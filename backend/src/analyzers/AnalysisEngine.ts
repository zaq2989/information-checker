import { 
  AnalysisEngine as IAnalysisEngine,
  SpreadData,
  Account,
  NetworkAnalysis,
  BotDetectionResult,
  CoordinationPattern,
  InfluenceScore,
  Anomaly,
  SpreadEvent,
  TimelineEvent
} from '../models';
import { Logger } from 'winston';
import { Pool } from 'pg';
import * as neo4j from 'neo4j-driver';
import { NetworkAnalyzer } from './NetworkAnalyzer';
import { BotDetector } from './BotDetector';
import { CoordinationDetector } from './CoordinationDetector';
import { AnomalyDetector } from './AnomalyDetector';

export class AnalysisEngine implements IAnalysisEngine {
  private networkAnalyzer: NetworkAnalyzer;
  private botDetector: BotDetector;
  private coordinationDetector: CoordinationDetector;
  private anomalyDetector: AnomalyDetector;
  private logger: Logger;
  private pgPool: Pool;
  private neo4jDriver: neo4j.Driver;

  constructor(logger: Logger, pgPool: Pool, neo4jDriver: neo4j.Driver) {
    this.logger = logger;
    this.pgPool = pgPool;
    this.neo4jDriver = neo4jDriver;
    this.networkAnalyzer = new NetworkAnalyzer(logger, pgPool, neo4jDriver);
    this.botDetector = new BotDetector(logger, pgPool);
    this.coordinationDetector = new CoordinationDetector(logger, pgPool, neo4jDriver);
    this.anomalyDetector = new AnomalyDetector(logger, pgPool);
  }

  async initialize(): Promise<void> {
    await this.botDetector.initialize();
    this.logger.info('Analysis engine initialized');
  }

  async runFullAnalysis(spreadData: SpreadData, analysisId: string): Promise<{
    network: NetworkAnalysis;
    bots: BotDetectionResult[];
    coordination: CoordinationPattern[];
    anomalies: Anomaly[];
    summary: any;
  }> {
    this.logger.info(`Starting full analysis for ${analysisId}`);
    
    try {
      // Update analysis status
      await this.updateAnalysisStatus(analysisId, 'running');
      
      // Run network analysis
      const network = await this.networkAnalyzer.analyzeNetwork(spreadData, analysisId);
      
      // Detect bots
      const accounts = this.extractAccounts(spreadData);
      const bots = await this.botDetector.detectBots(accounts);
      
      // Detect coordination
      const activities = this.extractActivities(spreadData);
      const coordination = await this.coordinationDetector.detectCoordination(activities, analysisId);
      
      // Detect anomalies
      const timeline = this.extractTimeline(spreadData);
      const anomalies = await this.anomalyDetector.detectAnomalies(timeline, analysisId);
      
      // Generate summary
      const summary = this.generateSummary(network, bots, coordination, anomalies);
      
      // Update analysis with results
      await this.storeAnalysisResults(analysisId, summary);
      await this.updateAnalysisStatus(analysisId, 'completed');
      
      return { network, bots, coordination, anomalies, summary };
    } catch (error) {
      this.logger.error('Analysis failed:', error);
      await this.updateAnalysisStatus(analysisId, 'failed', error.message);
      throw error;
    }
  }

  async analyzeNetwork(spreadData: SpreadData, analysisId: string): Promise<NetworkAnalysis> {
    return this.networkAnalyzer.analyzeNetwork(spreadData, analysisId);
  }

  async detectBots(accounts: Account[]): Promise<BotDetectionResult[]> {
    return await this.botDetector.detectBots(accounts);
  }

  async detectCoordination(activities: SpreadEvent[], analysisId: string): Promise<CoordinationPattern[]> {
    return this.coordinationDetector.detectCoordination(activities, analysisId);
  }

  calculateInfluence(account: Account, context: SpreadData, networkAnalysis?: NetworkAnalysis): InfluenceScore {
    const network = networkAnalysis || { 
      nodes: [], 
      edges: [], 
      clusters: [], 
      influencers: [], 
      propagationPaths: [], 
      metrics: null as any 
    };
    
    const influencerNode = network.influencers.find(i => i.accountId === account.id);
    
    const baseScore = influencerNode?.influenceScore || 0;
    const reach = influencerNode?.reachMetrics.directReach || 0;
    const indirectReach = influencerNode?.reachMetrics.indirectReach || 0;
    
    // Calculate engagement metrics from spread data
    const engagement = this.calculateEngagement(account.id, context);
    const amplification = this.calculateAmplification(account.id, context);
    const persistence = this.calculatePersistence(account.id, context);
    
    // Network position score
    const networkPosition = this.calculateNetworkPosition(account.id, network);
    
    // Content quality (would need actual content analysis)
    const contentQuality = 0.5; // Placeholder
    
    const overall = (
      baseScore * 0.3 +
      reach * 0.2 +
      engagement * 0.2 +
      amplification * 0.15 +
      persistence * 0.15
    );

    return {
      overall,
      reach,
      engagement,
      amplification,
      persistence,
      breakdown: {
        directInfluence: reach,
        indirectInfluence: indirectReach,
        networkPosition,
        contentQuality
      }
    };
  }

  async detectAnomalies(timeline: TimelineEvent[], analysisId: string): Promise<Anomaly[]> {
    return this.anomalyDetector.detectAnomalies(timeline, analysisId);
  }
  
  private async updateAnalysisStatus(analysisId: string, status: string, error?: string): Promise<void> {
    const query = error
      ? `UPDATE analysis SET status = $1, error = $2, completed_at = CURRENT_TIMESTAMP WHERE id = $3`
      : `UPDATE analysis SET status = $1 WHERE id = $2`;
    
    const params = error ? [status, error, analysisId] : [status, analysisId];
    await this.pgPool.query(query, params);
  }
  
  private async storeAnalysisResults(analysisId: string, summary: any): Promise<void> {
    await this.pgPool.query(
      `UPDATE analysis 
       SET result_summary = $1, completed_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [JSON.stringify(summary), analysisId]
    );
  }
  
  private extractAccounts(spreadData: SpreadData): Account[] {
    const accountMap = new Map<string, Account>();
    
    // Add original tweet author
    if (spreadData.originalTweet.author) {
      accountMap.set(spreadData.originalTweet.author.id, spreadData.originalTweet.author);
    }
    
    // Add from retweets, quotes, replies
    [...spreadData.retweets, ...spreadData.quotes, ...spreadData.replies].forEach(item => {
      if (item.author) {
        accountMap.set(item.author.id, item.author);
      }
    });
    
    return Array.from(accountMap.values());
  }
  
  private extractActivities(spreadData: SpreadData): SpreadEvent[] {
    const activities: SpreadEvent[] = [];
    
    // Convert to SpreadEvent format
    spreadData.retweets.forEach(rt => {
      activities.push({
        id: rt.id,
        type: 'retweet',
        sourceAccountId: rt.authorId,
        targetTweetId: spreadData.originalTweet.id,
        timestamp: rt.createdAt,
        cascadeDepth: rt.cascadeDepth,
        content: rt.text
      });
    });
    
    spreadData.quotes.forEach(qt => {
      activities.push({
        id: qt.id,
        type: 'quote',
        sourceAccountId: qt.authorId,
        targetTweetId: spreadData.originalTweet.id,
        timestamp: qt.createdAt,
        cascadeDepth: qt.cascadeDepth,
        content: qt.text
      });
    });
    
    return activities;
  }
  
  private extractTimeline(spreadData: SpreadData): TimelineEvent[] {
    const timeline: TimelineEvent[] = [];
    let eventId = 0;
    
    // Add original tweet
    timeline.push({
      id: String(eventId++),
      timestamp: spreadData.originalTweet.createdAt,
      type: 'original',
      accountId: spreadData.originalTweet.authorId,
      cascadeDepth: 0
    });
    
    // Add retweets
    spreadData.retweets.forEach(rt => {
      timeline.push({
        id: String(eventId++),
        timestamp: rt.createdAt,
        type: 'retweet',
        accountId: rt.authorId,
        cascadeDepth: 1
      });
    });
    
    // Add quotes
    spreadData.quotes.forEach(qt => {
      timeline.push({
        id: String(eventId++),
        timestamp: qt.createdAt,
        type: 'quote',
        accountId: qt.authorId,
        cascadeDepth: 1
      });
    });
    
    return timeline;
  }
  
  private generateSummary(
    network: NetworkAnalysis,
    bots: BotDetectionResult[],
    coordination: CoordinationPattern[],
    anomalies: Anomaly[]
  ): any {
    const botCount = bots.filter(b => b.classification === 'bot').length;
    const suspiciousCount = bots.filter(b => b.classification === 'cyborg' || b.classification === 'uncertain').length;
    
    return {
      timestamp: new Date(),
      metrics: {
        totalAccounts: network.nodes.length,
        totalInteractions: network.edges.length,
        networkDensity: network.metrics.density,
        clusteringCoefficient: network.metrics.clusteringCoefficient
      },
      botAnalysis: {
        confirmed: botCount,
        suspicious: suspiciousCount,
        percentage: (botCount / network.nodes.length) * 100
      },
      coordination: {
        patternsDetected: coordination.length,
        highConfidence: coordination.filter(c => c.confidence > 0.8).length,
        totalAccountsInvolved: new Set(coordination.flatMap(c => c.accounts)).size
      },
      anomalies: {
        total: anomalies.length,
        critical: anomalies.filter(a => a.severity === 'critical').length,
        high: anomalies.filter(a => a.severity === 'high').length,
        medium: anomalies.filter(a => a.severity === 'medium').length
      },
      topInfluencers: network.influencers.slice(0, 5).map(i => ({
        accountId: i.accountId,
        score: i.influenceScore,
        role: i.role
      }))
    };
  }

  private calculateEngagement(accountId: string, context: SpreadData): number {
    let engagement = 0;
    
    // Count interactions
    const interactions = [
      ...context.retweets.filter(r => r.authorId === accountId),
      ...context.quotes.filter(q => q.authorId === accountId),
      ...context.replies.filter(r => r.authorId === accountId)
    ];
    
    // Normalize by total interactions
    const totalInteractions = context.retweets.length + context.quotes.length + context.replies.length;
    
    return totalInteractions > 0 ? (interactions.length / totalInteractions) * 100 : 0;
  }

  private calculateAmplification(accountId: string, context: SpreadData): number {
    // Check if this account's actions led to further spread
    const accountActions = context.timeline.filter(e => e.accountId === accountId);
    
    if (accountActions.length === 0) return 0;
    
    let amplification = 0;
    for (const action of accountActions) {
      // Count subsequent actions that happened after this one
      const subsequentActions = context.timeline.filter(e => 
        e.timestamp > action.timestamp &&
        e.cascadeDepth > action.cascadeDepth
      );
      
      amplification += subsequentActions.length;
    }
    
    return Math.min(100, amplification);
  }

  private calculatePersistence(accountId: string, context: SpreadData): number {
    const accountEvents = context.timeline.filter(e => e.accountId === accountId);
    
    if (accountEvents.length < 2) return 0;
    
    const timestamps = accountEvents.map(e => e.timestamp.getTime()).sort();
    const timeSpan = timestamps[timestamps.length - 1] - timestamps[0];
    
    // Persistence score based on sustained activity over time
    const hourSpan = timeSpan / (1000 * 60 * 60);
    
    return Math.min(100, hourSpan * 10);
  }

  private calculateNetworkPosition(accountId: string, networkAnalysis: NetworkAnalysis): number {
    const node = networkAnalysis.nodes.find(n => n.accountId === accountId);
    if (!node) return 0;
    
    // Betweenness centrality approximation
    const connections = node.connections.length;
    const totalNodes = networkAnalysis.nodes.length;
    
    // Check if node is in multiple clusters
    const inClusters = networkAnalysis.clusters.filter(c => c.nodes.includes(accountId)).length;
    
    const centralityScore = (connections / totalNodes) * 50;
    const bridgeScore = inClusters > 1 ? 30 : 0;
    const typeScore = node.type === 'source' ? 20 : 0;
    
    return centralityScore + bridgeScore + typeScore;
  }
}