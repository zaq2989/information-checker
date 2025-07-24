import { 
  SpreadEvent, 
  CoordinationPattern, 
  CoordinationEvidence,
  ActivityPattern,
  TimeDistribution 
} from '../models';
import { Logger } from 'winston';
import { Pool } from 'pg';
import * as neo4j from 'neo4j-driver';

export class CoordinationDetector {
  private logger: Logger;
  private pgPool: Pool;
  private neo4jDriver: neo4j.Driver;
  private readonly timeWindowThreshold = 3 * 60 * 1000; // 3 minutes
  private readonly contentSimilarityThreshold = 0.8;
  private readonly minGroupSize = 3;

  constructor(logger: Logger, pgPool: Pool, neo4jDriver: neo4j.Driver) {
    this.logger = logger;
    this.pgPool = pgPool;
    this.neo4jDriver = neo4jDriver;
  }

  async detectCoordination(activities: SpreadEvent[], analysisId: string): Promise<CoordinationPattern[]> {
    const patterns: CoordinationPattern[] = [];

    // Detect temporal coordination
    const temporalPatterns = this.detectTemporalCoordination(activities);
    patterns.push(...temporalPatterns);

    // Detect content-based coordination
    const contentPatterns = this.detectContentCoordination(activities);
    patterns.push(...contentPatterns);

    // Detect network-based coordination
    const networkPatterns = await this.detectNetworkCoordination(activities);
    patterns.push(...networkPatterns);

    // Merge overlapping patterns
    const mergedPatterns = this.mergePatterns(patterns);
    
    // Store patterns in database
    await this.storeCoordinationPatterns(mergedPatterns, analysisId);

    return mergedPatterns;
  }
  
  private async storeCoordinationPatterns(patterns: CoordinationPattern[], analysisId: string): Promise<void> {
    for (const pattern of patterns) {
      try {
        const result = await this.pgPool.query(
          `INSERT INTO coordination_signals 
           (analysis_id, user_ids, coordination_type, confidence, evidence) 
           VALUES ($1, $2, $3, $4, $5) 
           RETURNING id`,
          [
            analysisId,
            pattern.accounts,
            pattern.type,
            pattern.confidence,
            JSON.stringify(pattern.evidence)
          ]
        );
        
        // Store in Neo4j for graph analysis
        await this.storeCoordinationInGraph(pattern, result.rows[0].id);
      } catch (error) {
        this.logger.error('Failed to store coordination pattern:', error);
      }
    }
  }
  
  private async storeCoordinationInGraph(pattern: CoordinationPattern, signalId: string): Promise<void> {
    const session = this.neo4jDriver.session();
    try {
      // Create coordination node
      await session.run(
        `MERGE (c:Coordination {id: $id})
         SET c.type = $type, c.confidence = $confidence, c.timestamp = datetime()`,
        {
          id: signalId,
          type: pattern.type,
          confidence: pattern.confidence
        }
      );
      
      // Link accounts to coordination
      for (const accountId of pattern.accounts) {
        await session.run(
          `MATCH (u:User {id: $userId})
           MATCH (c:Coordination {id: $coordId})
           MERGE (u)-[:PARTICIPATED_IN]->(c)`,
          {
            userId: accountId,
            coordId: signalId
          }
        );
      }
    } finally {
      await session.close();
    }
  }

  private detectTemporalCoordination(activities: SpreadEvent[]): CoordinationPattern[] {
    const patterns: CoordinationPattern[] = [];
    const timeGroups = this.groupByTimeWindow(activities);

    for (const [timestamp, group] of timeGroups.entries()) {
      if (group.length >= this.minGroupSize) {
        const uniqueAccounts = [...new Set(group.map(a => a.sourceAccountId))];
        
        if (uniqueAccounts.length >= this.minGroupSize) {
          const pattern = this.createTemporalPattern(group, uniqueAccounts);
          patterns.push(pattern);
        }
      }
    }

    return patterns;
  }

  private detectContentCoordination(activities: SpreadEvent[]): CoordinationPattern[] {
    const patterns: CoordinationPattern[] = [];
    const contentGroups = this.groupBySimilarContent(activities);

    for (const group of contentGroups) {
      if (group.length >= this.minGroupSize) {
        const uniqueAccounts = [...new Set(group.map(a => a.sourceAccountId))];
        
        if (uniqueAccounts.length >= this.minGroupSize) {
          const pattern = this.createContentPattern(group, uniqueAccounts);
          patterns.push(pattern);
        }
      }
    }

    return patterns;
  }

  private async detectNetworkCoordination(activities: SpreadEvent[]): Promise<CoordinationPattern[]> {
    const patterns: CoordinationPattern[] = [];
    const networkClusters = this.findNetworkClusters(activities);

    for (const cluster of networkClusters) {
      if (cluster.accounts.length >= this.minGroupSize) {
        const clusterActivities = activities.filter(a => 
          cluster.accounts.includes(a.sourceAccountId)
        );
        
        const pattern = this.createNetworkPattern(clusterActivities, cluster.accounts);
        patterns.push(pattern);
      }
    }

    return patterns;
  }

  private groupByTimeWindow(activities: SpreadEvent[]): Map<number, SpreadEvent[]> {
    const groups = new Map<number, SpreadEvent[]>();
    const sortedActivities = [...activities].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );

    for (const activity of sortedActivities) {
      const time = activity.timestamp.getTime();
      let grouped = false;

      for (const [groupTime, group] of groups.entries()) {
        if (Math.abs(time - groupTime) <= this.timeWindowThreshold) {
          group.push(activity);
          grouped = true;
          break;
        }
      }

      if (!grouped) {
        groups.set(time, [activity]);
      }
    }

    return groups;
  }

  private groupBySimilarContent(activities: SpreadEvent[]): SpreadEvent[][] {
    const groups: SpreadEvent[][] = [];
    const used = new Set<string>();

    for (let i = 0; i < activities.length; i++) {
      if (used.has(activities[i].id)) continue;

      const group = [activities[i]];
      used.add(activities[i].id);

      for (let j = i + 1; j < activities.length; j++) {
        if (used.has(activities[j].id)) continue;

        const similarity = this.calculateContentSimilarity(activities[i], activities[j]);
        if (similarity >= this.contentSimilarityThreshold) {
          group.push(activities[j]);
          used.add(activities[j].id);
        }
      }

      if (group.length >= this.minGroupSize) {
        groups.push(group);
      }
    }

    return groups;
  }

  private findNetworkClusters(activities: SpreadEvent[]): NetworkCluster[] {
    const adjacencyMap = new Map<string, Set<string>>();
    
    // Build adjacency map based on interaction patterns
    for (const activity of activities) {
      if (!adjacencyMap.has(activity.sourceAccountId)) {
        adjacencyMap.set(activity.sourceAccountId, new Set());
      }
      
      // Find related activities (replies, quotes to same content)
      const related = activities.filter(a => 
        a.targetTweetId === activity.targetTweetId && 
        a.sourceAccountId !== activity.sourceAccountId
      );
      
      for (const rel of related) {
        adjacencyMap.get(activity.sourceAccountId)?.add(rel.sourceAccountId);
      }
    }

    // Find clusters using simple community detection
    const clusters: NetworkCluster[] = [];
    const visited = new Set<string>();

    for (const [account, connections] of adjacencyMap.entries()) {
      if (!visited.has(account) && connections.size >= this.minGroupSize - 1) {
        const cluster = this.expandCluster(account, adjacencyMap, visited);
        if (cluster.length >= this.minGroupSize) {
          clusters.push({
            accounts: cluster,
            density: this.calculateClusterDensity(cluster, adjacencyMap)
          });
        }
      }
    }

    return clusters;
  }

  private expandCluster(
    start: string, 
    adjacencyMap: Map<string, Set<string>>, 
    visited: Set<string>
  ): string[] {
    const cluster: string[] = [];
    const queue = [start];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;

      visited.add(current);
      cluster.push(current);

      const connections = adjacencyMap.get(current) || new Set();
      for (const conn of connections) {
        if (!visited.has(conn)) {
          queue.push(conn);
        }
      }
    }

    return cluster;
  }

  private calculateClusterDensity(
    cluster: string[], 
    adjacencyMap: Map<string, Set<string>>
  ): number {
    let edges = 0;
    const n = cluster.length;

    for (const account of cluster) {
      const connections = adjacencyMap.get(account) || new Set();
      for (const conn of connections) {
        if (cluster.includes(conn)) {
          edges++;
        }
      }
    }

    // Density = actual edges / possible edges
    const possibleEdges = n * (n - 1);
    return possibleEdges > 0 ? edges / possibleEdges : 0;
  }

  private calculateContentSimilarity(a: SpreadEvent, b: SpreadEvent): number {
    if (!a.content || !b.content) return 0;

    // Simple Jaccard similarity for now
    const wordsA = new Set(a.content.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.content.toLowerCase().split(/\s+/));

    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private createTemporalPattern(
    activities: SpreadEvent[], 
    accounts: string[]
  ): CoordinationPattern {
    const timeWindow = this.calculateTimeWindow(activities);
    const evidence = this.generateTemporalEvidence(activities);

    return {
      accounts,
      type: 'temporal',
      confidence: this.calculateTemporalConfidence(activities),
      evidence,
      timeWindow
    };
  }

  private createContentPattern(
    activities: SpreadEvent[], 
    accounts: string[]
  ): CoordinationPattern {
    const timeWindow = this.calculateTimeWindow(activities);
    const evidence = this.generateContentEvidence(activities);

    return {
      accounts,
      type: 'content',
      confidence: this.calculateContentConfidence(activities),
      evidence,
      timeWindow
    };
  }

  private createNetworkPattern(
    activities: SpreadEvent[], 
    accounts: string[]
  ): CoordinationPattern {
    const timeWindow = this.calculateTimeWindow(activities);
    const evidence = this.generateNetworkEvidence(activities, accounts);

    return {
      accounts,
      type: 'network',
      confidence: this.calculateNetworkConfidence(activities, accounts),
      evidence,
      timeWindow
    };
  }

  private calculateTimeWindow(activities: SpreadEvent[]): { start: Date; end: Date } {
    const timestamps = activities.map(a => a.timestamp.getTime());
    return {
      start: new Date(Math.min(...timestamps)),
      end: new Date(Math.max(...timestamps))
    };
  }

  private generateTemporalEvidence(activities: SpreadEvent[]): CoordinationEvidence[] {
    const evidence: CoordinationEvidence[] = [];
    const timeGroups = this.groupByTimeWindow(activities);

    for (const [timestamp, group] of timeGroups.entries()) {
      if (group.length >= 2) {
        evidence.push({
          type: 'temporal_synchronization',
          description: `${group.length} accounts acted within ${this.timeWindowThreshold / 1000} seconds`,
          accounts: [...new Set(group.map(a => a.sourceAccountId))],
          timestamp: new Date(timestamp),
          strength: Math.min(1.0, group.length / 10)
        });
      }
    }

    return evidence;
  }

  private generateContentEvidence(activities: SpreadEvent[]): CoordinationEvidence[] {
    const evidence: CoordinationEvidence[] = [];
    const contentGroups = this.groupBySimilarContent(activities);

    for (const group of contentGroups) {
      if (group.length >= 2) {
        evidence.push({
          type: 'content_similarity',
          description: `${group.length} accounts posted similar content`,
          accounts: [...new Set(group.map(a => a.sourceAccountId))],
          timestamp: group[0].timestamp,
          strength: Math.min(1.0, group.length / 10)
        });
      }
    }

    return evidence;
  }

  private generateNetworkEvidence(
    activities: SpreadEvent[], 
    accounts: string[]
  ): CoordinationEvidence[] {
    const evidence: CoordinationEvidence[] = [];

    evidence.push({
      type: 'network_cluster',
      description: `Cluster of ${accounts.length} interconnected accounts detected`,
      accounts,
      timestamp: activities[0].timestamp,
      strength: Math.min(1.0, accounts.length / 20)
    });

    return evidence;
  }

  private calculateTemporalConfidence(activities: SpreadEvent[]): number {
    const timeSpread = this.calculateTimeSpread(activities);
    const accountDiversity = this.calculateAccountDiversity(activities);
    const burstiness = this.calculateBurstiness(activities);

    return (
      (1 - timeSpread) * 0.4 + 
      (1 - accountDiversity) * 0.3 + 
      burstiness * 0.3
    );
  }

  private calculateContentConfidence(activities: SpreadEvent[]): number {
    const avgSimilarity = this.calculateAverageContentSimilarity(activities);
    const accountDiversity = this.calculateAccountDiversity(activities);

    return avgSimilarity * 0.7 + (1 - accountDiversity) * 0.3;
  }

  private calculateNetworkConfidence(
    activities: SpreadEvent[], 
    accounts: string[]
  ): number {
    const density = this.calculateActivityDensity(activities, accounts);
    const consistency = this.calculateBehaviorConsistency(activities);

    return density * 0.6 + consistency * 0.4;
  }

  private calculateTimeSpread(activities: SpreadEvent[]): number {
    const timestamps = activities.map(a => a.timestamp.getTime());
    const min = Math.min(...timestamps);
    const max = Math.max(...timestamps);
    const spread = max - min;

    // Normalize to 0-1 (1 hour = 1.0)
    return Math.min(1.0, spread / (60 * 60 * 1000));
  }

  private calculateAccountDiversity(activities: SpreadEvent[]): number {
    const uniqueAccounts = new Set(activities.map(a => a.sourceAccountId));
    return uniqueAccounts.size / activities.length;
  }

  private calculateBurstiness(activities: SpreadEvent[]): number {
    const timestamps = activities.map(a => a.timestamp.getTime()).sort((a, b) => a - b);
    if (timestamps.length < 2) return 0;

    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => 
      sum + Math.pow(interval - mean, 2), 0
    ) / intervals.length;

    const cv = Math.sqrt(variance) / mean; // Coefficient of variation
    return Math.min(1.0, cv);
  }

  private calculateAverageContentSimilarity(activities: SpreadEvent[]): number {
    if (activities.length < 2) return 0;

    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < activities.length - 1; i++) {
      for (let j = i + 1; j < activities.length; j++) {
        totalSimilarity += this.calculateContentSimilarity(activities[i], activities[j]);
        comparisons++;
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  private calculateActivityDensity(
    activities: SpreadEvent[], 
    accounts: string[]
  ): number {
    const accountActivities = new Map<string, number>();
    
    for (const activity of activities) {
      const count = accountActivities.get(activity.sourceAccountId) || 0;
      accountActivities.set(activity.sourceAccountId, count + 1);
    }

    const avgActivities = activities.length / accounts.length;
    return Math.min(1.0, avgActivities / 10);
  }

  private calculateBehaviorConsistency(activities: SpreadEvent[]): number {
    // Group activities by account
    const accountActivities = new Map<string, SpreadEvent[]>();
    
    for (const activity of activities) {
      const list = accountActivities.get(activity.sourceAccountId) || [];
      list.push(activity);
      accountActivities.set(activity.sourceAccountId, list);
    }

    // Calculate consistency metrics
    let totalConsistency = 0;
    let accountCount = 0;

    for (const [_, accountActs] of accountActivities) {
      if (accountActs.length >= 2) {
        const consistency = this.calculateAccountConsistency(accountActs);
        totalConsistency += consistency;
        accountCount++;
      }
    }

    return accountCount > 0 ? totalConsistency / accountCount : 0;
  }

  private calculateAccountConsistency(activities: SpreadEvent[]): number {
    // Check for consistent behavior patterns (timing, type, etc.)
    const types = activities.map(a => a.type);
    const typeConsistency = new Set(types).size / types.length;

    return 1 - typeConsistency; // Higher consistency = lower diversity
  }

  private mergePatterns(patterns: CoordinationPattern[]): CoordinationPattern[] {
    const merged: CoordinationPattern[] = [];
    const used = new Set<number>();

    for (let i = 0; i < patterns.length; i++) {
      if (used.has(i)) continue;

      const basePattern = patterns[i];
      const accountSet = new Set(basePattern.accounts);
      const evidenceList = [...basePattern.evidence];

      for (let j = i + 1; j < patterns.length; j++) {
        if (used.has(j)) continue;

        const overlap = patterns[j].accounts.filter(a => accountSet.has(a));
        if (overlap.length >= this.minGroupSize - 1) {
          // Merge patterns
          patterns[j].accounts.forEach(a => accountSet.add(a));
          evidenceList.push(...patterns[j].evidence);
          used.add(j);
        }
      }

      merged.push({
        ...basePattern,
        accounts: Array.from(accountSet),
        type: 'mixed',
        evidence: evidenceList,
        confidence: Math.max(basePattern.confidence, 
          ...patterns.filter((_, idx) => used.has(idx)).map(p => p.confidence))
      });
    }

    return merged;
  }
}

interface NetworkCluster {
  accounts: string[];
  density: number;
}