import { Request, Response } from 'express';
import { logger } from '../../index';
import { v4 as uuidv4 } from 'uuid';
import { TwitterApi } from 'twitter-api-v2';
import { RateLimitService } from '../../services/RateLimitService';
import { DataStorageService } from '../../services/DataStorageService';
import dotenv from 'dotenv';

dotenv.config();

// In-memory storage for mock data
const mockAnalyses = new Map<string, any>();

// Lazy initialization of services
const getRateLimiter = () => RateLimitService.getInstance();
const getDataStorage = () => {
  const storage = DataStorageService.getInstance();
  storage.init(); // Ensure directories are created
  return storage;
};
const bearerToken = process.env.TWITTER_BEARER_TOKEN || '';
const twitterClient = bearerToken ? new TwitterApi(bearerToken).readOnly : null;

// Mock Twitter API data generator
function generateMockTwitterData(keyword: string) {
  const tweets = [];
  const baseTime = Date.now();
  
  for (let i = 0; i < 10; i++) {
    tweets.push({
      id: `tweet-${uuidv4()}`,
      text: `Mock tweet ${i + 1} about ${keyword}`,
      author: {
        id: `user-${Math.floor(Math.random() * 100)}`,
        username: `user${Math.floor(Math.random() * 100)}`,
        displayName: `User ${Math.floor(Math.random() * 100)}`,
        verified: Math.random() > 0.8,
        followersCount: Math.floor(Math.random() * 10000),
        followingCount: Math.floor(Math.random() * 1000),
        tweetCount: Math.floor(Math.random() * 5000)
      },
      createdAt: new Date(baseTime - Math.random() * 86400000), // Random time in last 24h
      metrics: {
        retweets: Math.floor(Math.random() * 100),
        likes: Math.floor(Math.random() * 500),
        replies: Math.floor(Math.random() * 50),
        quotes: Math.floor(Math.random() * 20)
      },
      sentiment: Math.random() > 0.5 ? 'positive' : Math.random() > 0.5 ? 'negative' : 'neutral',
      isBot: Math.random() > 0.9,
      spreadScore: Math.random()
    });
  }
  
  return tweets;
}

// Mock fact-checking data
function generateFactCheckData(keyword: string) {
  const factChecks = [
    {
      claim: `Information about ${keyword}`,
      verdict: Math.random() > 0.5 ? 'True' : Math.random() > 0.5 ? 'False' : 'Partially True',
      source: 'Mock Fact Checker',
      confidence: Math.random(),
      details: `This is a mock fact-check result for ${keyword}`
    }
  ];
  
  return factChecks;
}

export const createAnalysis = async (req: Request, res: Response) => {
  try {
    const { type, parameters } = req.body;
    const keyword = parameters?.keyword || 'test';
    
    // Create analysis record
    const analysisId = uuidv4();
    const analysis = {
      id: analysisId,
      type: type || 'spread',
      parameters,
      status: 'pending',
      createdAt: new Date(),
      keyword
    };
    
    mockAnalyses.set(analysisId, analysis);
    
    // Simulate async processing
    setTimeout(() => {
      const tweets = generateMockTwitterData(keyword);
      const factChecks = generateFactCheckData(keyword);
      
      mockAnalyses.set(analysisId, {
        ...analysis,
        status: 'completed',
        completedAt: new Date(),
        results: {
          tweets,
          factChecks,
          summary: {
            totalTweets: tweets.length,
            averageEngagement: tweets.reduce((acc, t) => acc + t.metrics.likes + t.metrics.retweets, 0) / tweets.length,
            botPercentage: (tweets.filter(t => t.isBot).length / tweets.length) * 100,
            sentimentDistribution: {
              positive: tweets.filter(t => t.sentiment === 'positive').length,
              negative: tweets.filter(t => t.sentiment === 'negative').length,
              neutral: tweets.filter(t => t.sentiment === 'neutral').length
            },
            topSpreaders: tweets
              .sort((a, b) => b.spreadScore - a.spreadScore)
              .slice(0, 3)
              .map(t => ({ username: t.author.username, score: t.spreadScore }))
          },
          networkGraph: {
            nodes: tweets.map(t => ({
              id: t.id,
              label: t.author.username,
              size: t.metrics.retweets + t.metrics.likes,
              color: t.isBot ? '#ff0000' : '#00ff00'
            })),
            edges: tweets.slice(0, -1).map((t, i) => ({
              id: `edge-${i}`,
              source: t.id,
              target: tweets[i + 1].id,
              weight: Math.random()
            }))
          }
        }
      });
      
      logger.info(`Mock analysis ${analysisId} completed`);
    }, 2000); // Simulate 2 second processing time
    
    res.json({ 
      message: 'Analysis created', 
      id: analysisId,
      status: 'pending'
    });
  } catch (error) {
    logger.error('Failed to create analysis:', error);
    res.status(500).json({ error: 'Failed to create analysis' });
  }
};

export const getAnalysis = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const analysis = mockAnalyses.get(id);
    
    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }
    
    res.json(analysis);
  } catch (error) {
    logger.error('Failed to get analysis:', error);
    res.status(500).json({ error: 'Failed to get analysis' });
  }
};

export const getAnalysisResults = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const analysis = mockAnalyses.get(id);
    
    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }
    
    if (analysis.status !== 'completed') {
      return res.json({ 
        id, 
        status: analysis.status,
        message: 'Analysis is still in progress' 
      });
    }
    
    res.json({
      id,
      status: 'completed',
      summary: analysis.results.summary,
      details: {
        tweets: analysis.results.tweets,
        factChecks: analysis.results.factChecks,
        networkGraph: analysis.results.networkGraph
      }
    });
  } catch (error) {
    logger.error('Failed to get analysis results:', error);
    res.status(500).json({ error: 'Failed to get analysis results' });
  }
};

export const searchTwitter = async (req: Request, res: Response) => {
  try {
    const { keyword, useReal } = req.query;
    
    if (!keyword) {
      return res.status(400).json({ error: 'Keyword is required' });
    }
    
    const endpoint = 'twitter-search';
    const cacheKey = `${keyword}`;
    
    // Check cache first
    const cached = getRateLimiter().getCachedResponse(endpoint, cacheKey);
    if (cached) {
      return res.json({
        ...cached,
        fromCache: true,
        rateLimit: getRateLimiter().getRateLimitInfo(endpoint)
      });
    }
    
    // Try real API if available and rate limit allows
    if (useReal === 'true' && twitterClient && getRateLimiter().canMakeRequest(endpoint)) {
      try {
        logger.info(`Attempting real Twitter API call for: ${keyword}`);
        getRateLimiter().recordRequest(endpoint);
        
        const tweets = await twitterClient.v2.search(keyword as string, {
          max_results: 10,
          'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
          'user.fields': ['name', 'username', 'verified'],
          expansions: ['author_id']
        });
        
        const formattedTweets = tweets.data?.data?.map((tweet: any) => {
          const author = tweets.includes?.users?.find((user: any) => user.id === tweet.author_id);
          return {
            id: tweet.id,
            text: tweet.text,
            createdAt: tweet.created_at,
            author: {
              username: author?.username || 'unknown',
              verified: author?.verified || false
            },
            metrics: tweet.public_metrics || {}
          };
        }) || [];
        
        const result = {
          keyword,
          count: formattedTweets.length,
          tweets: formattedTweets,
          source: 'twitter-api'
        };
        
        // Cache the result
        getRateLimiter().cacheResponse(endpoint, cacheKey, result);
        
        // Save to persistent storage
        const storageId = await getDataStorage().saveSearchData(keyword as string, result, 'twitter-api');
        
        return res.json({
          ...result,
          storageId,
          rateLimit: getRateLimiter().getRateLimitInfo(endpoint)
        });
      } catch (apiError: any) {
        logger.warn('Twitter API call failed, falling back to mock:', apiError.message);
      }
    }
    
    // Fall back to mock data
    const tweets = generateMockTwitterData(keyword as string);
    const result = {
      keyword,
      count: tweets.length,
      tweets,
      source: 'mock'
    };
    
    // Save mock data to storage
    const storageId = await getDataStorage().saveSearchData(keyword as string, result, 'mock');
    
    res.json({
      ...result,
      storageId,
      rateLimit: getRateLimiter().getRateLimitInfo(endpoint)
    });
  } catch (error) {
    logger.error('Failed to search Twitter:', error);
    res.status(500).json({ error: 'Failed to search Twitter' });
  }
};

export const checkFacts = async (req: Request, res: Response) => {
  try {
    const { claim } = req.body;
    
    if (!claim) {
      return res.status(400).json({ error: 'Claim is required' });
    }
    
    const factChecks = generateFactCheckData(claim);
    
    res.json({
      claim,
      results: factChecks
    });
  } catch (error) {
    logger.error('Failed to check facts:', error);
    res.status(500).json({ error: 'Failed to check facts' });
  }
};

// Data storage management endpoints
export const getSearchHistory = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const history = await getDataStorage().getSearchHistory(limit);
    
    res.json({
      count: history.length,
      history
    });
  } catch (error) {
    logger.error('Failed to get search history:', error);
    res.status(500).json({ error: 'Failed to get search history' });
  }
};

export const getStorageStats = async (req: Request, res: Response) => {
  try {
    const stats = await getDataStorage().getStorageStats();
    
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get storage stats:', error);
    res.status(500).json({ error: 'Failed to get storage statistics' });
  }
};

export const getStoredSearch = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = await getDataStorage().getSearchData(id);
    
    if (!data) {
      return res.status(404).json({ error: 'Search data not found' });
    }
    
    res.json(data);
  } catch (error) {
    logger.error('Failed to get stored search:', error);
    res.status(500).json({ error: 'Failed to get stored search data' });
  }
};

export const exportData = async (req: Request, res: Response) => {
  try {
    const filepath = await getDataStorage().exportSearchesAsCSV();
    
    res.json({
      message: 'Data exported successfully',
      filepath
    });
  } catch (error) {
    logger.error('Failed to export data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
};