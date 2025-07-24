import { Pool } from 'pg';
import * as neo4j from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { faker } from '@faker-js/faker';

// Database connections
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 
    'postgresql://analyzer:analyzer_secure_pass_2024@localhost:5432/twitter_analyzer'
});

const neo4jDriver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'neo4j_secure_pass_2024'
  )
);

// Generate random users
async function generateUsers(count: number) {
  const users = [];
  for (let i = 0; i < count; i++) {
    const createdAt = faker.date.past({ years: 5 });
    const followersCount = faker.number.int({ min: 10, max: 100000 });
    const followingCount = faker.number.int({ min: 10, max: 10000 });
    
    const user = {
      id: `user_${uuidv4()}`,
      username: faker.internet.userName(),
      display_name: faker.person.fullName(),
      created_at: createdAt,
      followers_count: followersCount,
      following_count: followingCount,
      tweet_count: faker.number.int({ min: 100, max: 50000 }),
      verified: faker.datatype.boolean({ probability: 0.1 }),
      description: faker.lorem.sentence(),
      location: faker.location.city(),
      profile_image_url: faker.image.avatar()
    };
    
    users.push(user);
    
    // Insert into PostgreSQL
    await pgPool.query(
      `INSERT INTO users (id, username, display_name, created_at, followers_count, 
        following_count, tweet_count, verified, description, location, profile_image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO NOTHING`,
      [user.id, user.username, user.display_name, user.created_at, user.followers_count,
       user.following_count, user.tweet_count, user.verified, user.description,
       user.location, user.profile_image_url]
    );
  }
  
  // Insert into Neo4j
  const session = neo4jDriver.session();
  try {
    for (const user of users) {
      await session.run(
        `CREATE (u:User {
          id: $id,
          username: $username,
          followersCount: $followersCount,
          verified: $verified
        })`,
        user
      );
    }
  } finally {
    await session.close();
  }
  
  return users;
}

// Generate a viral tweet spread
async function generateViralSpread() {
  console.log('Generating mock data...');
  
  // Generate users
  const users = await generateUsers(100);
  console.log(`Generated ${users.length} users`);
  
  // Pick a random user as the original author
  const author = users[faker.number.int({ min: 0, max: users.length - 1 })];
  
  // Create original tweet
  const originalTweet = {
    id: `tweet_${uuidv4()}`,
    author_id: author.id,
    text: faker.lorem.paragraph(),
    created_at: faker.date.recent({ days: 7 }),
    retweet_count: 0,
    like_count: 0,
    reply_count: 0,
    quote_count: 0
  };
  
  await pgPool.query(
    `INSERT INTO tweets (id, author_id, text, created_at, retweet_count, 
      like_count, reply_count, quote_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [originalTweet.id, originalTweet.author_id, originalTweet.text,
     originalTweet.created_at, originalTweet.retweet_count,
     originalTweet.like_count, originalTweet.reply_count, originalTweet.quote_count]
  );
  
  console.log('Created original tweet');
  
  // Generate spread events
  const spreadEvents = [];
  const retweeters = new Set<string>();
  
  // First wave - direct retweets
  for (let i = 0; i < 20; i++) {
    const retweeter = users[faker.number.int({ min: 0, max: users.length - 1 })];
    if (retweeters.has(retweeter.id)) continue;
    
    retweeters.add(retweeter.id);
    
    const event = {
      id: uuidv4(),
      type: 'retweet',
      source_tweet_id: originalTweet.id,
      source_user_id: retweeter.id,
      target_tweet_id: originalTweet.id,
      timestamp: faker.date.between({ 
        from: originalTweet.created_at, 
        to: new Date() 
      }),
      cascade_depth: 1
    };
    
    spreadEvents.push(event);
    
    await pgPool.query(
      `INSERT INTO spread_events (id, type, source_tweet_id, source_user_id, 
        target_tweet_id, timestamp, cascade_depth)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [event.id, event.type, event.source_tweet_id, event.source_user_id,
       event.target_tweet_id, event.timestamp, event.cascade_depth]
    );
  }
  
  // Second wave - retweets of retweets
  for (let i = 0; i < 30; i++) {
    const sourceEvent = spreadEvents[faker.number.int({ min: 0, max: spreadEvents.length - 1 })];
    const retweeter = users[faker.number.int({ min: 0, max: users.length - 1 })];
    
    if (retweeters.has(retweeter.id)) continue;
    retweeters.add(retweeter.id);
    
    const event = {
      id: uuidv4(),
      type: 'retweet',
      source_tweet_id: originalTweet.id,
      source_user_id: retweeter.id,
      target_tweet_id: originalTweet.id,
      timestamp: faker.date.between({ 
        from: sourceEvent.timestamp, 
        to: new Date() 
      }),
      cascade_depth: sourceEvent.cascade_depth + 1
    };
    
    spreadEvents.push(event);
    
    await pgPool.query(
      `INSERT INTO spread_events (id, type, source_tweet_id, source_user_id, 
        target_tweet_id, timestamp, cascade_depth)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [event.id, event.type, event.source_tweet_id, event.source_user_id,
       event.target_tweet_id, event.timestamp, event.cascade_depth]
    );
  }
  
  console.log(`Generated ${spreadEvents.length} spread events`);
  
  // Create Neo4j relationships
  const session = neo4jDriver.session();
  try {
    // Create tweet node
    await session.run(
      `CREATE (t:Tweet {
        id: $id,
        text: $text,
        authorId: $authorId,
        createdAt: $createdAt
      })`,
      {
        id: originalTweet.id,
        text: originalTweet.text,
        authorId: originalTweet.author_id,
        createdAt: originalTweet.created_at.toISOString()
      }
    );
    
    // Create spread relationships
    for (const event of spreadEvents) {
      await session.run(
        `MATCH (u:User {id: $userId})
         MATCH (t:Tweet {id: $tweetId})
         CREATE (u)-[:RETWEETED {
           timestamp: $timestamp,
           cascadeDepth: $cascadeDepth
         }]->(t)`,
        {
          userId: event.source_user_id,
          tweetId: event.source_tweet_id,
          timestamp: event.timestamp.toISOString(),
          cascadeDepth: event.cascade_depth
        }
      );
    }
  } finally {
    await session.close();
  }
  
  // Generate some bot signals for random users
  const suspiciousUsers = faker.helpers.arrayElements(users, 10);
  for (const user of suspiciousUsers) {
    await pgPool.query(
      `INSERT INTO bot_signals (user_id, signal_type, signal_value, confidence)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, signal_type) DO UPDATE
       SET signal_value = EXCLUDED.signal_value,
           confidence = EXCLUDED.confidence`,
      [
        user.id,
        'high_tweet_frequency',
        faker.number.float({ min: 0.6, max: 1.0 }),
        faker.number.float({ min: 0.7, max: 0.95 })
      ]
    );
  }
  
  console.log('Added bot signals for suspicious users');
  
  // Create an analysis record
  const analysisId = uuidv4();
  await pgPool.query(
    `INSERT INTO analysis (id, type, parameters, status, result_summary)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      analysisId,
      'tweet_spread',
      { tweetId: originalTweet.id },
      'completed',
      {
        totalReach: spreadEvents.length,
        maxCascadeDepth: Math.max(...spreadEvents.map(e => e.cascade_depth)),
        suspiciousBots: suspiciousUsers.length
      }
    ]
  );
  
  console.log(`Created analysis record: ${analysisId}`);
  
  return {
    tweet: originalTweet,
    users,
    spreadEvents,
    analysisId
  };
}

// Main execution
async function main() {
  try {
    await generateViralSpread();
    console.log('Mock data generation completed successfully!');
  } catch (error) {
    console.error('Error generating mock data:', error);
  } finally {
    await pgPool.end();
    await neo4jDriver.close();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}