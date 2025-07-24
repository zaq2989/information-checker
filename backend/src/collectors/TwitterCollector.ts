import { TwitterApi, TweetV2, UserV2 } from 'twitter-api-v2';
import { 
  TweetCollector, 
  Tweet, 
  SpreadData, 
  Retweet, 
  Quote, 
  Reply, 
  TimelineEvent,
  NetworkNode,
  SpreadEvent
} from '../models';
import { CacheService } from '../services/CacheService';
import { Logger } from 'winston';
import { RateLimiter } from '../utils/RateLimiter';

export class TwitterCollectorImpl implements TweetCollector {
  private client: TwitterApi;
  private cache: CacheService;
  private logger: Logger;
  private rateLimiter: RateLimiter;

  constructor(
    bearerToken: string,
    cache: CacheService,
    logger: Logger,
    rateLimiter: RateLimiter
  ) {
    this.client = new TwitterApi(bearerToken);
    this.cache = cache;
    this.logger = logger;
    this.rateLimiter = rateLimiter;
  }

  async collectTweetSpread(tweetId: string): Promise<SpreadData> {
    this.logger.info(`Collecting spread data for tweet: ${tweetId}`);
    
    const cacheKey = `spread:${tweetId}`;
    const cached = await this.cache.get<SpreadData>(cacheKey);
    if (cached) {
      this.logger.debug(`Returning cached spread data for: ${tweetId}`);
      return cached;
    }

    await this.rateLimiter.checkLimit('twitter-api');

    const originalTweet = await this.getTweetWithAuthor(tweetId);
    const [retweets, quotes, replies] = await Promise.all([
      this.collectRetweets(tweetId),
      this.collectQuotes(tweetId),
      this.collectReplies(tweetId)
    ]);

    const timeline = this.buildTimeline(originalTweet, retweets, quotes, replies);
    const networkGraph = this.buildNetworkGraph(originalTweet, retweets, quotes, replies);

    const spreadData: SpreadData = {
      originalTweet,
      retweets,
      quotes,
      replies,
      timeline,
      networkGraph
    };

    await this.cache.set(cacheKey, spreadData, 900); // Cache for 15 minutes

    return spreadData;
  }

  async *streamByKeywords(keywords: string[]): AsyncGenerator<Tweet> {
    const stream = await this.client.v2.searchStream({
      'tweet.fields': ['created_at', 'public_metrics', 'entities', 'referenced_tweets', 'conversation_id'],
      'user.fields': ['created_at', 'public_metrics', 'verified'],
      expansions: ['author_id', 'referenced_tweets.id']
    });

    const rules = keywords.map(keyword => ({ value: keyword }));
    await this.client.v2.updateStreamRules({ add: rules });

    for await (const tweet of stream) {
      if (tweet.data) {
        yield this.transformTweet(tweet as any);
      }
    }
  }

  async collectHistoricalData(
    query: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<Tweet[]> {
    const tweets: Tweet[] = [];
    
    const searchParams = {
      query,
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      'tweet.fields': ['created_at', 'public_metrics', 'entities', 'referenced_tweets', 'conversation_id'] as any,
      'user.fields': ['created_at', 'public_metrics', 'verified'] as any,
      expansions: ['author_id', 'referenced_tweets.id'] as any,
      max_results: 100
    };

    const paginator = await this.client.v2.search(searchParams as any);
    
    for await (const page of paginator) {
      // @ts-ignore - Twitter API types issue
      const data = page.data || page.tweets || page;
      for (const tweet of Array.isArray(data) ? data : [data]) {
        if (tweet && tweet.id) {
          tweets.push(this.transformTweet(tweet));
        }
      }
      
      await this.rateLimiter.consume('twitter-api', 1);
    }

    return tweets;
  }

  async collectUserTimeline(userId: string, limit: number = 200): Promise<Tweet[]> {
    const tweets: Tweet[] = [];
    
    const timeline = await this.client.v2.userTimeline(userId, {
      'tweet.fields': ['created_at', 'public_metrics', 'entities', 'referenced_tweets', 'conversation_id'],
      max_results: Math.min(limit, 100)
    });

    for await (const page of timeline) {
      // @ts-ignore - Twitter API types issue
      const data = page.data || page.tweets || page;
      for (const tweet of Array.isArray(data) ? data : [data]) {
        if (tweet && tweet.id) {
          tweets.push(this.transformTweet(tweet));
        }
      }
      
      if (tweets.length >= limit) break;
    }

    return tweets.slice(0, limit);
  }

  async collectConversation(conversationId: string): Promise<Tweet[]> {
    const tweets = await this.collectHistoricalData(
      `conversation_id:${conversationId}`,
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      new Date()
    );

    return tweets.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  private async getTweetWithAuthor(tweetId: string): Promise<Tweet> {
    const tweet = await this.client.v2.singleTweet(tweetId, {
      'tweet.fields': ['created_at', 'public_metrics', 'entities', 'referenced_tweets', 'conversation_id'],
      'user.fields': ['created_at', 'public_metrics', 'verified'],
      expansions: ['author_id']
    });

    return this.transformTweet(tweet as any);
  }

  private async collectRetweets(tweetId: string): Promise<Retweet[]> {
    const retweets: Retweet[] = [];
    const retweeters = await this.client.v2.tweetRetweetedBy(tweetId, {
      'user.fields': ['created_at'],
      max_results: 100
    });

    let cascadeDepth = 1;
    // @ts-ignore - Twitter API types issue
    for await (const user of retweeters) {
      retweets.push({
        id: `rt-${user.id}-${tweetId}`,
        authorId: user.id,
        createdAt: new Date(),
        cascadeDepth
      });
    }

    return retweets;
  }

  private async collectQuotes(tweetId: string): Promise<Quote[]> {
    const quotes: Quote[] = [];
    const searchQuery = `quoted_tweet_id:${tweetId}`;
    
    const quoteTweets = await this.client.v2.search(searchQuery, {
      'tweet.fields': ['created_at', 'text'],
      'user.fields': ['id'],
      expansions: ['author_id'],
      max_results: 100
    });

    let cascadeDepth = 1;
    for await (const page of quoteTweets) {
      // @ts-ignore - Twitter API types issue
      const data = page.data || page.tweets || page;
      for (const tweet of Array.isArray(data) ? data : [data]) {
        if (tweet && tweet.id) {
          quotes.push({
            id: tweet.id,
            authorId: tweet.author_id || '',
            text: tweet.text,
            createdAt: new Date(tweet.created_at || Date.now()),
            cascadeDepth
          });
        }
      }
    }

    return quotes;
  }

  private async collectReplies(tweetId: string): Promise<Reply[]> {
    const replies: Reply[] = [];
    const tweet = await this.getTweetWithAuthor(tweetId);
    
    if (!tweet.conversationId) return replies;

    const conversationTweets = await this.collectConversation(tweet.conversationId);
    
    for (const convTweet of conversationTweets) {
      if (convTweet.referencedTweets?.some(ref => ref.type === 'replied_to' && ref.id === tweetId)) {
        replies.push({
          id: convTweet.id,
          authorId: convTweet.authorId,
          text: convTweet.text,
          createdAt: convTweet.createdAt,
          cascadeDepth: 1,
          inReplyToId: tweetId
        });
      }
    }

    return replies;
  }

  private buildTimeline(
    originalTweet: Tweet,
    retweets: Retweet[],
    quotes: Quote[],
    replies: Reply[]
  ): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    events.push({
      id: `event-${originalTweet.id}`,
      type: 'original',
      timestamp: originalTweet.createdAt,
      accountId: originalTweet.authorId,
      tweetId: originalTweet.id,
      cascadeDepth: 0,
      impact: originalTweet.metrics.retweets + originalTweet.metrics.likes
    });

    for (const retweet of retweets) {
      events.push({
        id: `event-${retweet.id}`,
        type: 'retweet',
        timestamp: retweet.createdAt,
        accountId: retweet.authorId,
        tweetId: originalTweet.id,
        cascadeDepth: retweet.cascadeDepth,
        impact: 1
      });
    }

    for (const quote of quotes) {
      events.push({
        id: `event-${quote.id}`,
        type: 'quote',
        timestamp: quote.createdAt,
        accountId: quote.authorId,
        tweetId: quote.id,
        cascadeDepth: quote.cascadeDepth,
        impact: 2
      });
    }

    for (const reply of replies) {
      events.push({
        id: `event-${reply.id}`,
        type: 'reply',
        timestamp: reply.createdAt,
        accountId: reply.authorId,
        tweetId: reply.id,
        cascadeDepth: reply.cascadeDepth,
        impact: 1
      });
    }

    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private buildNetworkGraph(
    originalTweet: Tweet,
    retweets: Retweet[],
    quotes: Quote[],
    replies: Reply[]
  ): NetworkNode[] {
    const nodes: NetworkNode[] = [];
    const nodeMap = new Map<string, NetworkNode>();

    const sourceNode: NetworkNode = {
      id: `node-${originalTweet.authorId}`,
      accountId: originalTweet.authorId,
      type: 'source',
      influence: 100,
      connections: [],
      timestamp: originalTweet.createdAt
    };
    
    nodes.push(sourceNode);
    nodeMap.set(originalTweet.authorId, sourceNode);

    for (const retweet of retweets) {
      if (!nodeMap.has(retweet.authorId)) {
        const node: NetworkNode = {
          id: `node-${retweet.authorId}`,
          accountId: retweet.authorId,
          type: 'spreader',
          influence: 10,
          connections: [originalTweet.authorId],
          timestamp: retweet.createdAt
        };
        nodes.push(node);
        nodeMap.set(retweet.authorId, node);
      }
      
      sourceNode.connections.push(retweet.authorId);
    }

    for (const quote of quotes) {
      if (!nodeMap.has(quote.authorId)) {
        const node: NetworkNode = {
          id: `node-${quote.authorId}`,
          accountId: quote.authorId,
          type: 'spreader',
          influence: 20,
          connections: [originalTweet.authorId],
          timestamp: quote.createdAt
        };
        nodes.push(node);
        nodeMap.set(quote.authorId, node);
      }
    }

    return nodes;
  }

  private transformTweet(tweetData: TweetV2): Tweet {
    return {
      id: tweetData.id,
      authorId: tweetData.author_id || '',
      text: tweetData.text,
      createdAt: new Date(tweetData.created_at || Date.now()),
      metrics: {
        retweets: tweetData.public_metrics?.retweet_count || 0,
        likes: tweetData.public_metrics?.like_count || 0,
        replies: tweetData.public_metrics?.reply_count || 0,
        quotes: tweetData.public_metrics?.quote_count || 0
      },
      entities: {
        hashtags: tweetData.entities?.hashtags?.map(h => h.tag) || [],
        mentions: tweetData.entities?.mentions?.map(m => m.username) || [],
        urls: tweetData.entities?.urls?.map(u => u.expanded_url || u.url) || []
      },
      conversationId: tweetData.conversation_id,
      referencedTweets: tweetData.referenced_tweets
    };
  }
}