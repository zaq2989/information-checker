import { Request, Response } from 'express';
import { TwitterApi } from 'twitter-api-v2';
import { logger } from '../../index';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Twitter client with Bearer Token - force reload
const bearerToken = process.env.TWITTER_BEARER_TOKEN || '';
console.log('Loading Twitter Bearer Token...', bearerToken ? `Token loaded (${bearerToken.length} chars)` : 'No token');
const twitterClient = new TwitterApi(bearerToken);
const readOnlyClient = twitterClient.readOnly;

export const testTwitterConnection = async (req: Request, res: Response) => {
  try {
    logger.info('Testing Twitter API connection...');
    logger.info('Bearer Token present:', bearerToken ? 'Yes' : 'No');
    logger.info('Token length:', bearerToken.length);
    
    // First, test if we can access the API at all
    try {
      const me = await readOnlyClient.v2.me();
      logger.info('User authenticated:', me);
    } catch (meError: any) {
      logger.info('Me endpoint failed (expected for app-only auth):', meError.message);
    }
    
    // Test with a simple search (v2.search works for both recent and full archive)
    const jsTweets = await readOnlyClient.v2.search('JavaScript', {
      max_results: 10,
      'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
      'user.fields': ['name', 'username', 'verified'],
      expansions: ['author_id']
    });
    
    logger.info('Twitter API connection successful');
    
    res.json({
      status: 'success',
      message: 'Twitter API connected successfully',
      sampleData: {
        meta: jsTweets.meta,
        tweetCount: jsTweets.data?.data?.length || 0,
        firstTweet: jsTweets.data?.data?.[0] || null
      }
    });
  } catch (error: any) {
    logger.error('Twitter API connection failed:', error);
    
    res.status(500).json({
      status: 'error',
      message: 'Twitter API connection failed',
      error: error.message || 'Unknown error',
      details: error.data || error
    });
  }
};

export const searchTwitterRealtime = async (req: Request, res: Response) => {
  try {
    const { keyword } = req.query;
    
    if (!keyword) {
      return res.status(400).json({ error: 'Keyword is required' });
    }
    
    logger.info(`Searching Twitter for: ${keyword}`);
    
    const tweets = await readOnlyClient.v2.search(keyword as string, {
      max_results: 100,
      'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'lang', 'context_annotations', 'entities'],
      'user.fields': ['name', 'username', 'created_at', 'verified', 'public_metrics', 'description'],
      'expansions': ['author_id', 'referenced_tweets.id']
    });
    
    // Process and format the tweets
    const formattedTweets = tweets.data?.data?.map((tweet: any) => {
      const author = tweets.includes?.users?.find((user: any) => user.id === tweet.author_id);
      
      return {
        id: tweet.id,
        text: tweet.text,
        createdAt: tweet.created_at,
        author: {
          id: author?.id,
          username: author?.username,
          name: author?.name,
          verified: author?.verified || false,
          followersCount: author?.public_metrics?.followers_count || 0,
          followingCount: author?.public_metrics?.following_count || 0,
          tweetCount: author?.public_metrics?.tweet_count || 0
        },
        metrics: {
          retweets: tweet.public_metrics?.retweet_count || 0,
          likes: tweet.public_metrics?.like_count || 0,
          replies: tweet.public_metrics?.reply_count || 0,
          quotes: tweet.public_metrics?.quote_count || 0
        },
        lang: tweet.lang,
        entities: tweet.entities
      };
    }) || [];
    
    res.json({
      keyword,
      count: formattedTweets.length,
      tweets: formattedTweets,
      meta: tweets.meta
    });
  } catch (error: any) {
    logger.error('Failed to search Twitter:', error);
    res.status(500).json({ 
      error: 'Failed to search Twitter',
      message: error.message,
      details: error.data || error
    });
  }
};

export const analyzeTwitterSpread = async (req: Request, res: Response) => {
  try {
    const { tweetId } = req.params;
    
    if (!tweetId) {
      return res.status(400).json({ error: 'Tweet ID is required' });
    }
    
    logger.info(`Analyzing spread for tweet: ${tweetId}`);
    
    // Get the original tweet
    const originalTweet = await readOnlyClient.v2.singleTweet(tweetId, {
      'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'lang', 'context_annotations'],
      'user.fields': ['name', 'username', 'created_at', 'verified', 'public_metrics'],
      expansions: ['author_id']
    });
    
    // Search for quotes and replies (retweets are harder to get with v2 API)
    const quotes = await readOnlyClient.v2.search(`url:${tweetId}`, {
      max_results: 50,
      'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
      'user.fields': ['username', 'verified', 'public_metrics'],
      expansions: ['author_id']
    });
    
    // Analyze spread patterns
    const spreadAnalysis = {
      originalTweet: {
        id: originalTweet.data?.id,
        text: originalTweet.data?.text,
        author: originalTweet.includes?.users?.[0],
        metrics: originalTweet.data?.public_metrics,
        createdAt: originalTweet.data?.created_at
      },
      spread: {
        quotes: quotes.data?.data?.length || 0,
        totalEngagement: (originalTweet.data?.public_metrics?.retweet_count || 0) +
                        (originalTweet.data?.public_metrics?.like_count || 0) +
                        (originalTweet.data?.public_metrics?.reply_count || 0) +
                        (originalTweet.data?.public_metrics?.quote_count || 0)
      },
      quoteTweets: quotes.data?.data || []
    };
    
    res.json(spreadAnalysis);
  } catch (error: any) {
    logger.error('Failed to analyze Twitter spread:', error);
    res.status(500).json({ 
      error: 'Failed to analyze Twitter spread',
      message: error.message,
      details: error.data || error
    });
  }
};