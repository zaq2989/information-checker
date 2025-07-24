import { 
  SpreadData, 
  NetworkAnalysis, 
  NetworkNode, 
  NetworkEdge,
  Cluster,
  InfluencerNode,
  PropagationPath,
  NetworkMetrics,
  ActivityPattern,
  TimeDistribution
} from '../models';
import { Logger } from 'winston';
import { Pool } from 'pg';
import * as neo4j from 'neo4j-driver';

export class NetworkAnalyzer {
  private logger: Logger;
  private pgPool: Pool;
  private neo4jDriver: neo4j.Driver;

  constructor(logger: Logger, pgPool: Pool, neo4jDriver: neo4j.Driver) {
    this.logger = logger;
    this.pgPool = pgPool;
    this.neo4jDriver = neo4jDriver;
  }

  async analyzeNetwork(spreadData: SpreadData, analysisId: string): Promise<NetworkAnalysis> {
    this.logger.info('Starting network analysis');

    // Build network graph
    const { nodes, edges } = this.buildNetworkGraph(spreadData);

    // Store network in Neo4j
    await this.storeNetworkInGraph(nodes, edges, analysisId);

    // Detect clusters
    const clusters = this.detectClusters(nodes, edges);

    // Identify influencers
    const influencers = this.identifyInfluencers(nodes, edges, spreadData);

    // Trace propagation paths
    const propagationPaths = this.tracePropagationPaths(nodes, edges, spreadData);

    // Calculate network metrics
    const metrics = this.calculateNetworkMetrics(nodes, edges);

    // Store analysis results
    await this.storeAnalysisResults(analysisId, clusters, influencers, metrics);

    return {
      nodes,
      edges,
      clusters,
      influencers,
      propagationPaths,
      metrics
    };
  }
  
  private async storeNetworkInGraph(nodes: NetworkNode[], edges: NetworkEdge[], analysisId: string): Promise<void> {
    const session = this.neo4jDriver.session();
    try {
      // Create analysis node
      await session.run(
        'MERGE (a:Analysis {id: $id}) SET a.timestamp = datetime()',
        { id: analysisId }
      );
      
      // Create nodes
      for (const node of nodes) {
        await session.run(
          `MERGE (u:User {id: $accountId})
           SET u.type = $type, u.influence = $influence
           WITH u
           MATCH (a:Analysis {id: $analysisId})
           MERGE (u)-[:PART_OF]->(a)`,
          {
            accountId: node.accountId,
            type: node.type,
            influence: node.influence,
            analysisId
          }
        );
      }
      
      // Create edges
      for (const edge of edges) {
        await session.run(
          `MATCH (source:User {id: $source})
           MATCH (target:User {id: $target})
           MERGE (source)-[r:SPREAD {type: $type, timestamp: datetime($timestamp)}]->(target)
           SET r.weight = $weight, r.analysisId = $analysisId`,
          {
            source: edge.source,
            target: edge.target,
            type: edge.type,
            weight: edge.weight,
            timestamp: edge.timestamp.toISOString(),
            analysisId
          }
        );
      }
    } finally {
      await session.close();
    }
  }
  
  private async storeAnalysisResults(
    analysisId: string,
    clusters: Cluster[],
    influencers: InfluencerNode[],
    metrics: NetworkMetrics
  ): Promise<void> {
    try {
      // Store network metrics
      await this.pgPool.query(
        `UPDATE analysis 
         SET result_summary = jsonb_set(
           COALESCE(result_summary, '{}'),
           '{network_metrics}',
           $1::jsonb
         )
         WHERE id = $2`,
        [JSON.stringify(metrics), analysisId]
      );
      
      // Store cluster information
      for (const cluster of clusters) {
        await this.pgPool.query(
          `INSERT INTO anomalies (analysis_id, anomaly_type, severity, description, context)
           VALUES ($1, 'suspicious_cluster', $2, $3, $4)`,
          [
            analysisId,
            cluster.suspicionScore > 0.7 ? 'high' : 'medium',
            `Cluster of ${cluster.nodes.length} accounts with coherence ${cluster.coherence.toFixed(2)}`,
            JSON.stringify(cluster)
          ]
        );
      }
    } catch (error) {
      this.logger.error('Failed to store analysis results:', error);
    }
  }

  private buildNetworkGraph(spreadData: SpreadData): { nodes: NetworkNode[], edges: NetworkEdge[] } {
    const nodeMap = new Map<string, NetworkNode>();
    const edges: NetworkEdge[] = [];

    // Add original tweet author as source node
    const sourceNode: NetworkNode = {
      id: `node-${spreadData.originalTweet.authorId}`,
      accountId: spreadData.originalTweet.authorId,
      type: 'source',
      influence: 100,
      connections: [],
      timestamp: spreadData.originalTweet.createdAt
    };
    nodeMap.set(spreadData.originalTweet.authorId, sourceNode);

    // Process retweets
    for (const retweet of spreadData.retweets) {
      this.addNodeAndEdge(
        nodeMap, 
        edges, 
        retweet.authorId, 
        spreadData.originalTweet.authorId,
        'retweet',
        retweet.createdAt,
        1
      );
    }

    // Process quotes
    for (const quote of spreadData.quotes) {
      this.addNodeAndEdge(
        nodeMap, 
        edges, 
        quote.authorId, 
        spreadData.originalTweet.authorId,
        'quote',
        quote.createdAt,
        2
      );
    }

    // Process replies
    for (const reply of spreadData.replies) {
      this.addNodeAndEdge(
        nodeMap, 
        edges, 
        reply.authorId, 
        spreadData.originalTweet.authorId,
        'reply',
        reply.createdAt,
        1.5
      );
    }

    // Update node connections
    for (const edge of edges) {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      
      if (sourceNode && !sourceNode.connections.includes(edge.target)) {
        sourceNode.connections.push(edge.target);
      }
      if (targetNode && !targetNode.connections.includes(edge.source)) {
        targetNode.connections.push(edge.source);
      }
    }

    return { nodes: Array.from(nodeMap.values()), edges };
  }

  private addNodeAndEdge(
    nodeMap: Map<string, NetworkNode>,
    edges: NetworkEdge[],
    accountId: string,
    targetId: string,
    type: 'retweet' | 'quote' | 'reply',
    timestamp: Date,
    weight: number
  ) {
    if (!nodeMap.has(accountId)) {
      const node: NetworkNode = {
        id: `node-${accountId}`,
        accountId,
        type: 'spreader',
        influence: 0,
        connections: [],
        timestamp
      };
      nodeMap.set(accountId, node);
    }

    edges.push({
      source: accountId,
      target: targetId,
      type,
      weight,
      timestamp
    });
  }

  private detectClusters(nodes: NetworkNode[], edges: NetworkEdge[]): Cluster[] {
    const clusters: Cluster[] = [];
    const adjacencyList = this.buildAdjacencyList(nodes, edges);
    const visited = new Set<string>();

    for (const node of nodes) {
      if (!visited.has(node.accountId)) {
        const cluster = this.expandCluster(node.accountId, adjacencyList, visited);
        
        if (cluster.length >= 3) {
          const clusterData = this.analyzeCluster(cluster, nodes, edges);
          clusters.push(clusterData);
        }
      }
    }

    return clusters;
  }

  private buildAdjacencyList(
    nodes: NetworkNode[], 
    edges: NetworkEdge[]
  ): Map<string, Set<string>> {
    const adjacencyList = new Map<string, Set<string>>();

    for (const node of nodes) {
      adjacencyList.set(node.accountId, new Set());
    }

    for (const edge of edges) {
      adjacencyList.get(edge.source)?.add(edge.target);
      adjacencyList.get(edge.target)?.add(edge.source);
    }

    return adjacencyList;
  }

  private expandCluster(
    start: string,
    adjacencyList: Map<string, Set<string>>,
    visited: Set<string>
  ): string[] {
    const cluster: string[] = [];
    const queue = [start];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;

      visited.add(current);
      cluster.push(current);

      const neighbors = adjacencyList.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    return cluster;
  }

  private analyzeCluster(
    clusterNodes: string[], 
    allNodes: NetworkNode[], 
    edges: NetworkEdge[]
  ): Cluster {
    const clusterEdges = edges.filter(e => 
      clusterNodes.includes(e.source) && clusterNodes.includes(e.target)
    );

    const activityPattern = this.calculateActivityPattern(clusterNodes, allNodes);
    const coherence = this.calculateClusterCoherence(clusterNodes, clusterEdges);
    const suspicionScore = this.calculateSuspicionScore(activityPattern, coherence);

    return {
      id: `cluster-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      nodes: clusterNodes,
      coherence,
      activityPattern,
      suspicionScore
    };
  }

  private calculateActivityPattern(
    clusterNodes: string[], 
    allNodes: NetworkNode[]
  ): ActivityPattern {
    const timestamps = clusterNodes
      .map(id => allNodes.find(n => n.accountId === id)?.timestamp)
      .filter(t => t !== undefined) as Date[];

    const timeDistribution = this.calculateTimeDistribution(timestamps);
    const contentSimilarity = 0.5; // Would need actual content to calculate
    const coordinationScore = this.calculateCoordinationScore(timestamps);
    const burstiness = this.calculateBurstiness(timestamps);

    return {
      timeDistribution,
      contentSimilarity,
      coordinationScore,
      burstiness
    };
  }

  private calculateTimeDistribution(timestamps: Date[]): TimeDistribution {
    const hourly = new Array(24).fill(0);
    const daily = new Array(7).fill(0);

    for (const timestamp of timestamps) {
      const hour = timestamp.getHours();
      const day = timestamp.getDay();
      
      hourly[hour]++;
      daily[day]++;
    }

    // Normalize
    const total = timestamps.length;
    for (let i = 0; i < 24; i++) hourly[i] = hourly[i] / total;
    for (let i = 0; i < 7; i++) daily[i] = daily[i] / total;

    return {
      hourly,
      daily,
      timezone: 'UTC' // Would need geolocation data for accurate timezone
    };
  }

  private calculateCoordinationScore(timestamps: Date[]): number {
    if (timestamps.length < 2) return 0;

    const sorted = timestamps.sort((a, b) => a.getTime() - b.getTime());
    const intervals: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
      intervals.push(sorted[i].getTime() - sorted[i-1].getTime());
    }

    // Check for suspiciously regular intervals
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => 
      sum + Math.pow(interval - avgInterval, 2), 0
    ) / intervals.length;

    const stdDev = Math.sqrt(variance);
    const cv = stdDev / avgInterval; // Coefficient of variation

    // Lower CV indicates more regular timing (suspicious)
    return Math.max(0, 1 - cv);
  }

  private calculateBurstiness(timestamps: Date[]): number {
    if (timestamps.length < 2) return 0;

    const sorted = timestamps.sort((a, b) => a.getTime() - b.getTime());
    const timeRange = sorted[sorted.length - 1].getTime() - sorted[0].getTime();
    
    if (timeRange === 0) return 1; // All at same time = maximum burstiness

    const expectedInterval = timeRange / (timestamps.length - 1);
    const intervals: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
      intervals.push(sorted[i].getTime() - sorted[i-1].getTime());
    }

    const burstScore = intervals.filter(i => i < expectedInterval * 0.5).length / intervals.length;
    return burstScore;
  }

  private calculateClusterCoherence(nodes: string[], edges: NetworkEdge[]): number {
    const n = nodes.length;
    if (n < 2) return 0;

    const actualEdges = edges.length;
    const possibleEdges = (n * (n - 1)) / 2;

    return actualEdges / possibleEdges;
  }

  private calculateSuspicionScore(
    activityPattern: ActivityPattern, 
    coherence: number
  ): number {
    const coordScore = activityPattern.coordinationScore * 0.4;
    const burstScore = activityPattern.burstiness * 0.3;
    const cohScore = coherence * 0.3;

    return Math.min(1, coordScore + burstScore + cohScore);
  }

  private identifyInfluencers(
    nodes: NetworkNode[], 
    edges: NetworkEdge[], 
    spreadData: SpreadData
  ): InfluencerNode[] {
    const influencers: InfluencerNode[] = [];
    const degreeMap = this.calculateDegrees(nodes, edges);
    const reachMap = this.calculateReach(nodes, edges);

    for (const node of nodes) {
      const degree = degreeMap.get(node.accountId) || 0;
      const reach = reachMap.get(node.accountId) || { direct: 0, indirect: 0, depth: 0 };
      
      // Calculate influence score
      const influenceScore = this.calculateInfluenceScore(node, degree, reach, edges);
      
      if (influenceScore > 10) { // Threshold for being considered an influencer
        const role = this.determineInfluencerRole(node, spreadData);
        
        influencers.push({
          accountId: node.accountId,
          influenceScore,
          reachMetrics: {
            directReach: reach.direct,
            indirectReach: reach.indirect,
            cascadeDepth: reach.depth
          },
          role
        });
      }
    }

    return influencers.sort((a, b) => b.influenceScore - a.influenceScore);
  }

  private calculateDegrees(
    nodes: NetworkNode[], 
    edges: NetworkEdge[]
  ): Map<string, number> {
    const degrees = new Map<string, number>();

    for (const node of nodes) {
      degrees.set(node.accountId, 0);
    }

    for (const edge of edges) {
      degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
      degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
    }

    return degrees;
  }

  private calculateReach(
    nodes: NetworkNode[], 
    edges: NetworkEdge[]
  ): Map<string, { direct: number, indirect: number, depth: number }> {
    const reachMap = new Map();
    const adjacencyList = this.buildAdjacencyList(nodes, edges);

    for (const node of nodes) {
      const reach = this.bfsReach(node.accountId, adjacencyList);
      reachMap.set(node.accountId, reach);
    }

    return reachMap;
  }

  private bfsReach(
    start: string, 
    adjacencyList: Map<string, Set<string>>
  ): { direct: number, indirect: number, depth: number } {
    const visited = new Set<string>();
    const queue: { node: string, depth: number }[] = [{ node: start, depth: 0 }];
    let direct = 0;
    let indirect = 0;
    let maxDepth = 0;

    while (queue.length > 0) {
      const { node, depth } = queue.shift()!;
      
      if (visited.has(node)) continue;
      visited.add(node);

      if (depth === 1) direct++;
      else if (depth > 1) indirect++;
      
      maxDepth = Math.max(maxDepth, depth);

      const neighbors = adjacencyList.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push({ node: neighbor, depth: depth + 1 });
        }
      }
    }

    return { direct, indirect, depth: maxDepth };
  }

  private calculateInfluenceScore(
    node: NetworkNode,
    degree: number,
    reach: { direct: number, indirect: number, depth: number },
    edges: NetworkEdge[]
  ): number {
    // Base influence from node type
    let baseInfluence = node.type === 'source' ? 50 : 10;

    // Degree centrality component
    const degreeFactor = Math.min(degree / 10, 1) * 30;

    // Reach component
    const reachFactor = (reach.direct + reach.indirect * 0.5) / 20 * 20;

    // Temporal component (early spreaders get bonus)
    const nodeEdges = edges.filter(e => e.source === node.accountId);
    const avgTimestamp = nodeEdges.length > 0
      ? nodeEdges.reduce((sum, e) => sum + e.timestamp.getTime(), 0) / nodeEdges.length
      : node.timestamp.getTime();
    
    const earliestTime = Math.min(...edges.map(e => e.timestamp.getTime()));
    const timeRange = Math.max(...edges.map(e => e.timestamp.getTime())) - earliestTime;
    const temporalFactor = timeRange > 0 
      ? (1 - (avgTimestamp - earliestTime) / timeRange) * 20
      : 0;

    return baseInfluence + degreeFactor + reachFactor + temporalFactor;
  }

  private determineInfluencerRole(
    node: NetworkNode, 
    spreadData: SpreadData
  ): 'originator' | 'amplifier' | 'bridge' {
    if (node.accountId === spreadData.originalTweet.authorId) {
      return 'originator';
    }

    // Check if the node connects different clusters
    if (node.connections.length > 5) {
      return 'bridge';
    }

    return 'amplifier';
  }

  private tracePropagationPaths(
    nodes: NetworkNode[], 
    edges: NetworkEdge[], 
    spreadData: SpreadData
  ): PropagationPath[] {
    const paths: PropagationPath[] = [];
    const sourceId = spreadData.originalTweet.authorId;
    
    // Find all leaf nodes (nodes with no outgoing edges in the spread)
    const leafNodes = this.findLeafNodes(nodes, edges);

    for (const leaf of leafNodes) {
      const path = this.findPath(sourceId, leaf.accountId, edges);
      if (path.length > 1) {
        const pathData = this.analyzeePath(path, nodes, edges);
        paths.push(pathData);
      }
    }

    return paths.sort((a, b) => b.reach - a.reach).slice(0, 10); // Top 10 paths
  }

  private findLeafNodes(nodes: NetworkNode[], edges: NetworkEdge[]): NetworkNode[] {
    const hasOutgoing = new Set(edges.map(e => e.source));
    return nodes.filter(n => !hasOutgoing.has(n.accountId));
  }

  private findPath(start: string, end: string, edges: NetworkEdge[]): string[] {
    const adjacencyMap = new Map<string, string[]>();
    
    for (const edge of edges) {
      if (!adjacencyMap.has(edge.target)) {
        adjacencyMap.set(edge.target, []);
      }
      adjacencyMap.get(edge.target)?.push(edge.source);
    }

    // BFS to find path
    const queue: { node: string, path: string[] }[] = [{ node: end, path: [end] }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;
      
      if (node === start) {
        return path.reverse();
      }

      if (visited.has(node)) continue;
      visited.add(node);

      const parents = adjacencyMap.get(node) || [];
      for (const parent of parents) {
        if (!visited.has(parent)) {
          queue.push({ node: parent, path: [...path, parent] });
        }
      }
    }

    return [];
  }

  private analyzeePath(
    path: string[], 
    nodes: NetworkNode[], 
    edges: NetworkEdge[]
  ): PropagationPath {
    const pathNodes = path.map(id => nodes.find(n => n.accountId === id)!);
    const timestamps = pathNodes.map(n => n.timestamp.getTime());
    
    const totalTime = Math.max(...timestamps) - Math.min(...timestamps);
    const velocity = path.length / (totalTime / (1000 * 60)); // nodes per minute
    
    // Calculate reach as sum of connections from path nodes
    const reach = pathNodes.reduce((sum, node) => sum + node.connections.length, 0);

    return {
      nodes: path,
      totalTime,
      velocity,
      reach
    };
  }

  private calculateNetworkMetrics(
    nodes: NetworkNode[], 
    edges: NetworkEdge[]
  ): NetworkMetrics {
    const degrees = this.calculateDegrees(nodes, edges);
    const totalDegree = Array.from(degrees.values()).reduce((a, b) => a + b, 0);
    
    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      density: this.calculateDensity(nodes.length, edges.length),
      averageDegree: totalDegree / nodes.length,
      clusteringCoefficient: this.calculateClusteringCoefficient(nodes, edges),
      modularity: this.calculateModularity(nodes, edges)
    };
  }

  private calculateDensity(nodeCount: number, edgeCount: number): number {
    if (nodeCount < 2) return 0;
    const maxEdges = (nodeCount * (nodeCount - 1)) / 2;
    return edgeCount / maxEdges;
  }

  private calculateClusteringCoefficient(
    nodes: NetworkNode[], 
    edges: NetworkEdge[]
  ): number {
    const adjacencyList = this.buildAdjacencyList(nodes, edges);
    let totalCoefficient = 0;
    let validNodes = 0;

    for (const node of nodes) {
      const neighbors = Array.from(adjacencyList.get(node.accountId) || []);
      
      if (neighbors.length >= 2) {
        const possibleEdges = (neighbors.length * (neighbors.length - 1)) / 2;
        let actualEdges = 0;

        for (let i = 0; i < neighbors.length; i++) {
          for (let j = i + 1; j < neighbors.length; j++) {
            if (adjacencyList.get(neighbors[i])?.has(neighbors[j])) {
              actualEdges++;
            }
          }
        }

        totalCoefficient += actualEdges / possibleEdges;
        validNodes++;
      }
    }

    return validNodes > 0 ? totalCoefficient / validNodes : 0;
  }

  private calculateModularity(nodes: NetworkNode[], edges: NetworkEdge[]): number {
    // Simplified modularity calculation
    // In a real implementation, this would use community detection algorithms
    return 0.5; // Placeholder
  }
}