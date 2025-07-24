import { 
  TimelineEvent, 
  Anomaly, 
  AnomalyMetrics 
} from '../models';
import { Logger } from 'winston';
import { Pool } from 'pg';

export class AnomalyDetector {
  private logger: Logger;
  private pgPool: Pool;
  private readonly spikeThreshold = 3; // Standard deviations
  private readonly minEventsForAnalysis = 10;

  constructor(logger: Logger, pgPool: Pool) {
    this.logger = logger;
    this.pgPool = pgPool;
  }

  async detectAnomalies(timeline: TimelineEvent[], analysisId: string): Promise<Anomaly[]> {
    if (timeline.length < this.minEventsForAnalysis) {
      this.logger.debug('Not enough events for anomaly detection');
      return [];
    }

    const anomalies: Anomaly[] = [];

    // Sort timeline by timestamp
    const sortedTimeline = [...timeline].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );

    // Detect different types of anomalies
    anomalies.push(...this.detectVolumeSpikes(sortedTimeline));
    anomalies.push(...this.detectTemporalPatterns(sortedTimeline));
    anomalies.push(...this.detectBehaviorAnomalies(sortedTimeline));
    anomalies.push(...this.detectNetworkAnomalies(sortedTimeline));

    // Deduplicate and prioritize anomalies
    const prioritizedAnomalies = this.prioritizeAnomalies(anomalies);
    
    // Store anomalies in database
    await this.storeAnomalies(prioritizedAnomalies, analysisId);
    
    return prioritizedAnomalies;
  }
  
  private async storeAnomalies(anomalies: Anomaly[], analysisId: string): Promise<void> {
    for (const anomaly of anomalies) {
      try {
        await this.pgPool.query(
          `INSERT INTO anomalies (analysis_id, anomaly_type, severity, description, context)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            analysisId,
            anomaly.type,
            anomaly.severity,
            anomaly.description,
            JSON.stringify({
              affectedAccounts: anomaly.affectedAccounts,
              metrics: anomaly.metrics,
              timestamp: anomaly.timestamp
            })
          ]
        );
      } catch (error) {
        this.logger.error('Failed to store anomaly:', error);
      }
    }
  }

  private detectVolumeSpikes(timeline: TimelineEvent[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const windowSize = 5 * 60 * 1000; // 5 minutes
    const volumeByWindow = this.calculateVolumeByWindow(timeline, windowSize);

    // Calculate statistics
    const volumes = Array.from(volumeByWindow.values());
    const stats = this.calculateStatistics(volumes);

    // Detect spikes
    for (const [timestamp, volume] of volumeByWindow.entries()) {
      const zScore = (volume - stats.mean) / stats.stdDev;
      
      if (Math.abs(zScore) > this.spikeThreshold) {
        const affectedEvents = timeline.filter(e => 
          Math.abs(e.timestamp.getTime() - timestamp) <= windowSize / 2
        );

        anomalies.push({
          id: `spike-${timestamp}`,
          type: 'spike',
          severity: this.calculateSpikeSeverity(zScore),
          timestamp: new Date(timestamp),
          description: `Unusual ${zScore > 0 ? 'spike' : 'drop'} in activity: ${volume} events (${zScore.toFixed(2)} std devs from mean)`,
          affectedAccounts: [...new Set(affectedEvents.map(e => e.accountId))],
          metrics: {
            deviation: zScore,
            baseline: stats.mean,
            observed: volume,
            confidence: Math.min(0.99, Math.abs(zScore) / 5)
          }
        });
      }
    }

    return anomalies;
  }

  private detectTemporalPatterns(timeline: TimelineEvent[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    
    // Group events by account
    const accountEvents = new Map<string, TimelineEvent[]>();
    for (const event of timeline) {
      const events = accountEvents.get(event.accountId) || [];
      events.push(event);
      accountEvents.set(event.accountId, events);
    }

    // Analyze each account's temporal patterns
    for (const [accountId, events] of accountEvents) {
      if (events.length < 5) continue;

      const intervals = this.calculateIntervals(events);
      const regularityScore = this.calculateRegularity(intervals);

      if (regularityScore > 0.8) {
        anomalies.push({
          id: `pattern-${accountId}-${Date.now()}`,
          type: 'pattern',
          severity: 'medium',
          timestamp: events[0].timestamp,
          description: `Account ${accountId} shows suspiciously regular activity patterns (regularity: ${(regularityScore * 100).toFixed(1)}%)`,
          affectedAccounts: [accountId],
          metrics: {
            deviation: regularityScore,
            baseline: 0.5,
            observed: regularityScore,
            confidence: 0.7
          }
        });
      }
    }

    return anomalies;
  }

  private detectBehaviorAnomalies(timeline: TimelineEvent[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    
    // Detect unusual behavior patterns
    const behaviorGroups = this.groupByBehavior(timeline);

    for (const [behavior, events] of behaviorGroups) {
      // Check for sudden changes in behavior
      const changes = this.detectBehaviorChanges(events);
      
      for (const change of changes) {
        anomalies.push({
          id: `behavior-${behavior}-${change.timestamp}`,
          type: 'behavior',
          severity: change.severity,
          timestamp: new Date(change.timestamp),
          description: change.description,
          affectedAccounts: change.accounts,
          metrics: change.metrics
        });
      }
    }

    return anomalies;
  }

  private detectNetworkAnomalies(timeline: TimelineEvent[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    
    // Detect cascade anomalies
    const cascadeDepths = timeline.map(e => e.cascadeDepth);
    const maxDepth = Math.max(...cascadeDepths);
    
    if (maxDepth > 10) {
      anomalies.push({
        id: `network-depth-${Date.now()}`,
        type: 'network',
        severity: 'high',
        timestamp: new Date(),
        description: `Unusually deep cascade detected (depth: ${maxDepth})`,
        affectedAccounts: timeline
          .filter(e => e.cascadeDepth >= maxDepth - 2)
          .map(e => e.accountId),
        metrics: {
          deviation: maxDepth,
          baseline: 5,
          observed: maxDepth,
          confidence: 0.8
        }
      });
    }

    // Detect star patterns (one account triggering many others)
    const triggerCounts = new Map<string, number>();
    for (const event of timeline) {
      if (event.cascadeDepth === 0) {
        const count = timeline.filter(e => 
          e.cascadeDepth === 1 && 
          Math.abs(e.timestamp.getTime() - event.timestamp.getTime()) < 60000
        ).length;
        triggerCounts.set(event.accountId, count);
      }
    }

    for (const [accountId, count] of triggerCounts) {
      if (count > 20) {
        anomalies.push({
          id: `network-star-${accountId}`,
          type: 'network',
          severity: 'high',
          timestamp: new Date(),
          description: `Star pattern detected: ${accountId} triggered ${count} immediate responses`,
          affectedAccounts: [accountId],
          metrics: {
            deviation: count,
            baseline: 5,
            observed: count,
            confidence: 0.9
          }
        });
      }
    }

    return anomalies;
  }

  private calculateVolumeByWindow(
    timeline: TimelineEvent[], 
    windowSize: number
  ): Map<number, number> {
    const volumeMap = new Map<number, number>();
    
    for (const event of timeline) {
      const windowStart = Math.floor(event.timestamp.getTime() / windowSize) * windowSize;
      volumeMap.set(windowStart, (volumeMap.get(windowStart) || 0) + 1);
    }

    return volumeMap;
  }

  private calculateStatistics(values: number[]): { mean: number, stdDev: number } {
    if (values.length === 0) return { mean: 0, stdDev: 0 };

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return { mean, stdDev };
  }

  private calculateSpikeSeverity(zScore: number): 'low' | 'medium' | 'high' | 'critical' {
    const absZ = Math.abs(zScore);
    if (absZ >= 5) return 'critical';
    if (absZ >= 4) return 'high';
    if (absZ >= 3) return 'medium';
    return 'low';
  }

  private calculateIntervals(events: TimelineEvent[]): number[] {
    const sorted = events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const intervals: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
      intervals.push(sorted[i].timestamp.getTime() - sorted[i-1].timestamp.getTime());
    }

    return intervals;
  }

  private calculateRegularity(intervals: number[]): number {
    if (intervals.length < 2) return 0;

    const stats = this.calculateStatistics(intervals);
    if (stats.mean === 0) return 0;

    // Coefficient of variation (lower = more regular)
    const cv = stats.stdDev / stats.mean;
    
    // Convert to 0-1 scale where 1 is perfectly regular
    return Math.max(0, 1 - cv);
  }

  private groupByBehavior(timeline: TimelineEvent[]): Map<string, TimelineEvent[]> {
    const groups = new Map<string, TimelineEvent[]>();

    for (const event of timeline) {
      const key = `${event.type}-${event.cascadeDepth}`;
      const group = groups.get(key) || [];
      group.push(event);
      groups.set(key, group);
    }

    return groups;
  }

  private detectBehaviorChanges(events: TimelineEvent[]): BehaviorChange[] {
    const changes: BehaviorChange[] = [];
    
    if (events.length < 10) return changes;

    // Split into time windows and compare behavior
    const windowSize = 10 * 60 * 1000; // 10 minutes
    const windows = this.splitIntoWindows(events, windowSize);

    for (let i = 1; i < windows.length; i++) {
      const prevWindow = windows[i - 1];
      const currWindow = windows[i];

      const change = this.compareBehavior(prevWindow, currWindow);
      if (change) {
        changes.push(change);
      }
    }

    return changes;
  }

  private splitIntoWindows(
    events: TimelineEvent[], 
    windowSize: number
  ): TimelineEvent[][] {
    const windows: TimelineEvent[][] = [];
    const sorted = [...events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    let currentWindow: TimelineEvent[] = [];
    let windowStart = sorted[0]?.timestamp.getTime() || 0;

    for (const event of sorted) {
      if (event.timestamp.getTime() - windowStart > windowSize) {
        if (currentWindow.length > 0) {
          windows.push(currentWindow);
        }
        currentWindow = [event];
        windowStart = event.timestamp.getTime();
      } else {
        currentWindow.push(event);
      }
    }

    if (currentWindow.length > 0) {
      windows.push(currentWindow);
    }

    return windows;
  }

  private compareBehavior(
    window1: TimelineEvent[], 
    window2: TimelineEvent[]
  ): BehaviorChange | null {
    // Compare activity rates
    const rate1 = window1.length;
    const rate2 = window2.length;
    const rateChange = Math.abs(rate2 - rate1) / Math.max(rate1, 1);

    if (rateChange > 2) {
      return {
        timestamp: window2[0].timestamp.getTime(),
        severity: rateChange > 5 ? 'high' : 'medium',
        description: `Sudden change in activity rate: ${rate1} → ${rate2} events`,
        accounts: [...new Set(window2.map(e => e.accountId))],
        metrics: {
          deviation: rateChange,
          baseline: rate1,
          observed: rate2,
          confidence: 0.7
        }
      };
    }

    return null;
  }

  private prioritizeAnomalies(anomalies: Anomaly[]): Anomaly[] {
    // Remove duplicates
    const unique = new Map<string, Anomaly>();
    
    for (const anomaly of anomalies) {
      const key = `${anomaly.type}-${anomaly.affectedAccounts.join(',')}-${Math.floor(anomaly.timestamp.getTime() / 60000)}`;
      
      if (!unique.has(key) || this.getSeverityScore(anomaly) > this.getSeverityScore(unique.get(key)!)) {
        unique.set(key, anomaly);
      }
    }

    // Sort by severity and confidence
    return Array.from(unique.values()).sort((a, b) => {
      const scoreA = this.getSeverityScore(a) * a.metrics.confidence;
      const scoreB = this.getSeverityScore(b) * b.metrics.confidence;
      return scoreB - scoreA;
    });
  }

  private getSeverityScore(anomaly: Anomaly): number {
    switch (anomaly.severity) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }
}

interface BehaviorChange {
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  accounts: string[];
  metrics: AnomalyMetrics;
}