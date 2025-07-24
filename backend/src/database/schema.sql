-- Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    created_at TIMESTAMP,
    followers_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    tweet_count INTEGER DEFAULT 0,
    verified BOOLEAN DEFAULT FALSE,
    bot_score FLOAT DEFAULT 0,
    collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tweets table
CREATE TABLE IF NOT EXISTS tweets (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id),
    text TEXT,
    created_at TIMESTAMP,
    retweet_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    quote_count INTEGER DEFAULT 0,
    is_retweet BOOLEAN DEFAULT FALSE,
    original_tweet_id VARCHAR(64),
    collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analysis table
CREATE TABLE IF NOT EXISTS analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    parameters JSONB,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    error TEXT,
    result_summary JSONB
);

-- Spread events table (for tracking how info spreads)
CREATE TABLE IF NOT EXISTS spread_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID REFERENCES analysis(id),
    source_user_id VARCHAR(64) REFERENCES users(id),
    target_user_id VARCHAR(64) REFERENCES users(id),
    tweet_id VARCHAR(64) REFERENCES tweets(id),
    event_type VARCHAR(20), -- 'retweet', 'quote', 'reply'
    timestamp TIMESTAMP,
    depth INTEGER DEFAULT 0,
    collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bot signals table
CREATE TABLE IF NOT EXISTS bot_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(64) REFERENCES users(id),
    signal_type VARCHAR(50),
    signal_value FLOAT,
    confidence FLOAT,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, signal_type)
);

-- Coordination signals table
CREATE TABLE IF NOT EXISTS coordination_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID REFERENCES analysis(id),
    user_ids TEXT[], -- Array of coordinating user IDs
    coordination_type VARCHAR(50),
    confidence FLOAT,
    evidence JSONB,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Anomalies table
CREATE TABLE IF NOT EXISTS anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID REFERENCES analysis(id),
    anomaly_type VARCHAR(50),
    severity VARCHAR(20),
    description TEXT,
    context JSONB,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_tweets_user_id ON tweets(user_id);
CREATE INDEX IF NOT EXISTS idx_tweets_created_at ON tweets(created_at);
CREATE INDEX IF NOT EXISTS idx_spread_events_analysis_id ON spread_events(analysis_id);
CREATE INDEX IF NOT EXISTS idx_spread_events_timestamp ON spread_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_bot_signals_user_id ON bot_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_coordination_signals_analysis_id ON coordination_signals(analysis_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_analysis_id ON anomalies(analysis_id);

-- Create views for common queries
CREATE OR REPLACE VIEW user_influence_metrics AS
SELECT 
    u.id,
    u.username,
    u.followers_count,
    COUNT(DISTINCT se.target_user_id) as reach_count,
    AVG(se.depth) as avg_spread_depth,
    COUNT(DISTINCT se.tweet_id) as spread_tweet_count
FROM users u
LEFT JOIN spread_events se ON u.id = se.source_user_id
GROUP BY u.id, u.username, u.followers_count;