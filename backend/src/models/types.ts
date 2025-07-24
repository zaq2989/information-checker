export interface Tweet {
  id: string;
  authorId: string;
  author?: Account;
  text: string;
  createdAt: Date;
  metrics: {
    retweets: number;
    likes: number;
    replies: number;
    quotes: number;
  };
  entities?: {
    hashtags: string[];
    mentions: string[];
    urls: string[];
  };
  conversationId?: string;
  referencedTweets?: ReferencedTweet[];
}

export interface ReferencedTweet {
  type: 'retweeted' | 'quoted' | 'replied_to';
  id: string;
}

export interface Account {
  id: string;
  username: string;
  displayName: string;
  createdAt: Date;
  followersCount: number;
  followingCount: number;
  tweetCount: number;
  verified: boolean;
  profileMetrics: ProfileMetrics;
  description?: string;
  location?: string;
  profileImageUrl?: string;
}

export interface ProfileMetrics {
  averageTweetsPerDay: number;
  accountAgeInDays: number;
  followersToFollowingRatio: number;
  engagementRate: number;
  hashtagDiversity: number;
  urlUsageRate: number;
  replyRate: number;
  retweetRate: number;
}

export interface SpreadEvent {
  id: string;
  type: 'retweet' | 'quote' | 'reply';
  sourceAccountId: string;
  targetTweetId: string;
  timestamp: Date;
  cascadeDepth: number;
  content?: string;
  metrics?: {
    retweets: number;
    likes: number;
    replies: number;
  };
}

export interface SpreadData {
  originalTweet: Tweet;
  retweets: Retweet[];
  quotes: Quote[];
  replies: Reply[];
  timeline: TimelineEvent[];
  networkGraph: NetworkNode[];
}

export interface Retweet {
  id: string;
  authorId: string;
  author?: Account;
  text?: string;
  createdAt: Date;
  cascadeDepth: number;
}

export interface Quote {
  id: string;
  authorId: string;
  author?: Account;
  text: string;
  createdAt: Date;
  cascadeDepth: number;
}

export interface Reply {
  id: string;
  authorId: string;
  author?: Account;
  text: string;
  createdAt: Date;
  cascadeDepth: number;
  inReplyToId: string;
}

export interface TimelineEvent {
  id: string;
  type: 'original' | 'retweet' | 'quote' | 'reply';
  timestamp: Date;
  accountId: string;
  tweetId?: string;
  cascadeDepth: number;
  impact?: number;
}

export interface NetworkNode {
  id: string;
  accountId: string;
  type: 'source' | 'spreader' | 'endpoint';
  influence: number;
  connections: string[];
  timestamp: Date;
}

export interface NetworkAnalysis {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  clusters: Cluster[];
  influencers: InfluencerNode[];
  propagationPaths: PropagationPath[];
  metrics: NetworkMetrics;
}

export interface NetworkEdge {
  source: string;
  target: string;
  type: 'retweet' | 'quote' | 'reply';
  weight: number;
  timestamp: Date;
}

export interface Cluster {
  id: string;
  nodes: string[];
  coherence: number;
  activityPattern: ActivityPattern;
  suspicionScore: number;
}

export interface ActivityPattern {
  timeDistribution: TimeDistribution;
  contentSimilarity: number;
  coordinationScore: number;
  burstiness: number;
}

export interface TimeDistribution {
  hourly: number[];
  daily: number[];
  timezone: string;
}

export interface InfluencerNode {
  accountId: string;
  influenceScore: number;
  reachMetrics: {
    directReach: number;
    indirectReach: number;
    cascadeDepth: number;
  };
  role: 'originator' | 'amplifier' | 'bridge';
}

export interface PropagationPath {
  nodes: string[];
  totalTime: number;
  velocity: number;
  reach: number;
}

export interface NetworkMetrics {
  totalNodes: number;
  totalEdges: number;
  density: number;
  averageDegree: number;
  clusteringCoefficient: number;
  modularity: number;
}

export interface BotDetectionResult {
  accountId: string;
  botProbability: number;
  signals: BotSignal[];
  classification: 'human' | 'bot' | 'cyborg' | 'uncertain';
  confidence: number;
}

export interface BotSignal {
  type: string;
  value: number;
  weight: number;
  description: string;
}

export interface CoordinationPattern {
  accounts: string[];
  type: 'temporal' | 'content' | 'network' | 'mixed';
  confidence: number;
  evidence: CoordinationEvidence[];
  timeWindow: {
    start: Date;
    end: Date;
  };
}

export interface CoordinationEvidence {
  type: string;
  description: string;
  accounts: string[];
  timestamp: Date;
  strength: number;
}

export interface InfluenceScore {
  overall: number;
  reach: number;
  engagement: number;
  amplification: number;
  persistence: number;
  breakdown: {
    directInfluence: number;
    indirectInfluence: number;
    networkPosition: number;
    contentQuality: number;
  };
}

export interface Anomaly {
  id: string;
  type: 'spike' | 'pattern' | 'behavior' | 'network';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  description: string;
  affectedAccounts: string[];
  metrics: AnomalyMetrics;
}

export interface AnomalyMetrics {
  deviation: number;
  baseline: number;
  observed: number;
  confidence: number;
}

export interface AnalysisRequest {
  tweetId?: string;
  keywords?: string[];
  startDate?: Date;
  endDate?: Date;
  options: {
    includeBotDetection: boolean;
    includeCoordinationAnalysis: boolean;
    includeNetworkAnalysis: boolean;
    includeAnomalyDetection: boolean;
    depth: number;
  };
}

export interface AnalysisResult {
  id: string;
  createdAt: Date;
  request: AnalysisRequest;
  spreadData: SpreadData;
  networkAnalysis?: NetworkAnalysis;
  botDetection?: BotDetectionResult[];
  coordinationPatterns?: CoordinationPattern[];
  anomalies?: Anomaly[];
  summary: AnalysisSummary;
}

export interface AnalysisSummary {
  totalReach: number;
  uniqueAccounts: number;
  botPercentage: number;
  coordinationDetected: boolean;
  viralityScore: number;
  riskAssessment: RiskAssessment;
}

export interface RiskAssessment {
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: string[];
  recommendations: string[];
}