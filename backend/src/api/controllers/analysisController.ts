import { Request, Response } from 'express';
import { pgPool, analysisEngine, logger } from '../../index';
import { v4 as uuidv4 } from 'uuid';

export const createAnalysis = async (req: Request, res: Response) => {
  try {
    const { type, parameters } = req.body;
    
    // Create analysis record
    const analysisId = uuidv4();
    await pgPool.query(
      `INSERT INTO analysis (id, type, parameters, status) 
       VALUES ($1, $2, $3, 'pending')`,
      [analysisId, type, parameters]
    );
    
    // Start analysis asynchronously
    startAnalysisAsync(analysisId, type, parameters);
    
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
    
    const result = await pgPool.query(
      'SELECT * FROM analysis WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Failed to get analysis:', error);
    res.status(500).json({ error: 'Failed to get analysis' });
  }
};

export const getAnalysisResults = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Get main analysis
    const analysisResult = await pgPool.query(
      'SELECT * FROM analysis WHERE id = $1',
      [id]
    );
    
    if (analysisResult.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found' });
    }
    
    const analysis = analysisResult.rows[0];
    
    if (analysis.status !== 'completed') {
      return res.json({ 
        id, 
        status: analysis.status,
        message: 'Analysis is still in progress' 
      });
    }
    
    // Get detailed results
    const [anomalies, coordination, botSignals] = await Promise.all([
      pgPool.query('SELECT * FROM anomalies WHERE analysis_id = $1', [id]),
      pgPool.query('SELECT * FROM coordination_signals WHERE analysis_id = $1', [id]),
      pgPool.query(
        `SELECT bs.* FROM bot_signals bs
         JOIN users u ON bs.user_id = u.id
         WHERE u.collected_at >= $1`,
        [analysis.started_at]
      )
    ]);
    
    res.json({
      id,
      status: 'completed',
      summary: analysis.result_summary,
      details: {
        anomalies: anomalies.rows,
        coordination: coordination.rows,
        botSignals: botSignals.rows
      }
    });
  } catch (error) {
    logger.error('Failed to get analysis results:', error);
    res.status(500).json({ error: 'Failed to get analysis results' });
  }
};

// Helper function to start analysis asynchronously
async function startAnalysisAsync(analysisId: string, type: string, parameters: any) {
  try {
    // TODO: Implement actual data collection based on parameters
    // For now, we'll use mock data
    const mockSpreadData = {
      originalTweet: {
        id: 'mock-tweet-1',
        authorId: 'mock-user-1',
        text: 'Mock tweet for testing',
        createdAt: new Date(),
        metrics: {
          retweets: 100,
          likes: 50,
          replies: 20,
          quotes: 10
        },
        author: {
          id: 'mock-user-1',
          username: 'mockuser',
          displayName: 'Mock User',
          createdAt: new Date(),
          followersCount: 1000,
          followingCount: 500,
          tweetCount: 5000,
          verified: false,
          profileMetrics: {
            averageTweetsPerDay: 10,
            accountAgeInDays: 500,
            followersToFollowingRatio: 2,
            engagementRate: 0.05,
            hashtagDiversity: 0.5,
            urlUsageRate: 0.2,
            replyRate: 0.3,
            retweetRate: 0.4
          }
        }
      },
      retweets: [],
      quotes: [],
      replies: [],
      timeline: [],
      networkGraph: []
    };
    
    // Run analysis
    await analysisEngine.runFullAnalysis(mockSpreadData, analysisId);
  } catch (error) {
    logger.error(`Analysis ${analysisId} failed:`, error);
    await pgPool.query(
      `UPDATE analysis 
       SET status = 'failed', error = $1, completed_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [(error as Error).message, analysisId]
    );
  }
}