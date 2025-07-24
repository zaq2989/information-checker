// Create constraints for unique IDs
CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE;
CREATE CONSTRAINT tweet_id IF NOT EXISTS FOR (t:Tweet) REQUIRE t.id IS UNIQUE;
CREATE CONSTRAINT analysis_id IF NOT EXISTS FOR (a:Analysis) REQUIRE a.id IS UNIQUE;

// Create indexes for performance
CREATE INDEX user_username IF NOT EXISTS FOR (u:User) ON (u.username);
CREATE INDEX tweet_created_at IF NOT EXISTS FOR (t:Tweet) ON (t.created_at);
CREATE INDEX user_bot_score IF NOT EXISTS FOR (u:User) ON (u.bot_score);

// Example queries for creating nodes and relationships

// Create User node
// MERGE (u:User {id: $userId})
// SET u.username = $username,
//     u.display_name = $displayName,
//     u.followers_count = $followersCount,
//     u.following_count = $followingCount,
//     u.tweet_count = $tweetCount,
//     u.verified = $verified,
//     u.bot_score = $botScore,
//     u.created_at = datetime($createdAt)

// Create Tweet node
// MERGE (t:Tweet {id: $tweetId})
// SET t.text = $text,
//     t.created_at = datetime($createdAt),
//     t.retweet_count = $retweetCount,
//     t.reply_count = $replyCount,
//     t.like_count = $likeCount

// Create relationships
// MATCH (u:User {id: $userId})
// MATCH (t:Tweet {id: $tweetId})
// MERGE (u)-[:POSTED]->(t)

// For retweets
// MATCH (retweeter:User {id: $retweeterId})
// MATCH (original:Tweet {id: $originalTweetId})
// MATCH (retweet:Tweet {id: $retweetId})
// MERGE (retweeter)-[:RETWEETED {timestamp: datetime($timestamp)}]->(original)
// MERGE (retweet)-[:RETWEET_OF]->(original)

// For replies
// MATCH (replier:User {id: $replierId})
// MATCH (original:Tweet {id: $originalTweetId})
// MATCH (reply:Tweet {id: $replyId})
// MERGE (replier)-[:REPLIED_TO {timestamp: datetime($timestamp)}]->(original)
// MERGE (reply)-[:REPLY_TO]->(original)

// For follows (if we collect this data)
// MATCH (follower:User {id: $followerId})
// MATCH (followed:User {id: $followedId})
// MERGE (follower)-[:FOLLOWS {since: datetime($since)}]->(followed)

// Queries for analysis

// Find influential users in a spread network
// MATCH (u:User)-[r:RETWEETED|QUOTED|REPLIED_TO*1..3]->(t:Tweet)
// WHERE t.id = $tweetId
// WITH u, COUNT(DISTINCT r) as interactions
// RETURN u.username, u.followers_count, interactions
// ORDER BY interactions DESC, u.followers_count DESC
// LIMIT 20

// Detect coordination patterns
// MATCH (u1:User)-[:RETWEETED|QUOTED]->(t:Tweet)<-[:RETWEETED|QUOTED]-(u2:User)
// WHERE u1.id < u2.id
// AND datetime(t.created_at) > datetime() - duration('PT1H')
// WITH u1, u2, COUNT(DISTINCT t) as shared_tweets
// WHERE shared_tweets > 5
// RETURN u1.username, u2.username, shared_tweets
// ORDER BY shared_tweets DESC

// Find bot-like behavior patterns
// MATCH (u:User)-[r:POSTED|RETWEETED]->(t:Tweet)
// WHERE datetime(t.created_at) > datetime() - duration('PT24H')
// WITH u, COUNT(r) as activity_count,
//      COLLECT(DISTINCT datetime(t.created_at).hour) as active_hours
// WHERE activity_count > 100
// OR SIZE(active_hours) = 24
// RETURN u.username, u.bot_score, activity_count, SIZE(active_hours) as hours_active
// ORDER BY activity_count DESC