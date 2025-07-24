export interface Tweet {
  id: string;
  authorId: string;
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
}

export interface NetworkNode {
  id: string;
  accountId: string;
  type: 'source' | 'spreader' | 'endpoint';
  influence: number;
  connections: string[];
  timestamp: Date;
}

export interface NetworkEdge {
  source: string;
  target: string;
  type: 'retweet' | 'quote' | 'reply';
  weight: number;
  timestamp: Date;
}

export interface NetworkData {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
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

export interface Activity {
  accountId: string;
  timestamp: Date;
  type: string;
}

export interface BotDetectionResult {
  accountId: string;
  botProbability: number;
  classification: 'human' | 'bot' | 'cyborg' | 'uncertain';
  confidence: number;
  signals: Array<{
    type: string;
    value: number;
    weight: number;
    description: string;
  }>;
}

export interface CoordinationPattern {
  accounts: string[];
  type: 'temporal' | 'content' | 'network' | 'mixed';
  confidence: number;
  timeWindow: {
    start: Date;
    end: Date;
  };
}

export interface AnalysisResult {
  id: string;
  createdAt: Date;
  spreadData: {
    originalTweet: Tweet;
    retweets: any[];
    quotes: any[];
    replies: any[];
    timeline: TimelineEvent[];
    networkGraph: NetworkNode[];
  };
  networkAnalysis?: {
    nodes: NetworkNode[];
    edges: NetworkEdge[];
    clusters: any[];
    influencers: any[];
    propagationPaths: any[];
    metrics: any;
  };
  botDetection?: BotDetectionResult[];
  coordinationPatterns?: CoordinationPattern[];
  anomalies?: any[];
  summary: {
    totalReach: number;
    uniqueAccounts: number;
    botPercentage: number;
    coordinationDetected: boolean;
    viralityScore: number;
    riskAssessment: {
      level: 'low' | 'medium' | 'high' | 'critical';
      factors: string[];
      recommendations: string[];
    };
  };
}