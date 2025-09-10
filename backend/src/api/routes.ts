import { Router } from 'express';
import * as analysisController from './controllers/analysisController';
import * as mockAnalysisController from './controllers/mockAnalysisController';
import * as twitterTestController from './controllers/twitterTestController';
import * as collectorController from './controllers/collectorController';
import * as accountController from './controllers/accountController';

export const apiRouter = Router();

// Check if running in NO_DB mode
const NO_DB_MODE = process.env.NO_DB === 'true' || process.env.NODE_ENV === 'development';

// Twitter API test endpoints
apiRouter.get('/twitter/test', twitterTestController.testTwitterConnection);
apiRouter.get('/twitter/search', twitterTestController.searchTwitterRealtime);
apiRouter.get('/twitter/spread/:tweetId', twitterTestController.analyzeTwitterSpread);

// Analysis endpoints - use mock controllers in NO_DB mode
if (NO_DB_MODE) {
  apiRouter.post('/analysis', mockAnalysisController.createAnalysis);
  apiRouter.get('/analysis/:id', mockAnalysisController.getAnalysis);
  apiRouter.get('/analysis/:id/results', mockAnalysisController.getAnalysisResults);
  apiRouter.get('/search', mockAnalysisController.searchTwitter);
  apiRouter.post('/factcheck', mockAnalysisController.checkFacts);
  
  // Data storage endpoints
  apiRouter.get('/data/history', mockAnalysisController.getSearchHistory);
  apiRouter.get('/data/stats', mockAnalysisController.getStorageStats);
  apiRouter.get('/data/search/:id', mockAnalysisController.getStoredSearch);
  apiRouter.post('/data/export', mockAnalysisController.exportData);
} else {
  apiRouter.post('/analysis', analysisController.createAnalysis);
  apiRouter.get('/analysis/:id', analysisController.getAnalysis);
  apiRouter.get('/analysis/:id/results', analysisController.getAnalysisResults);
}

// Data collection endpoints - disable in NO_DB mode
if (!NO_DB_MODE) {
  apiRouter.post('/collect/tweet', collectorController.collectTweet);
  apiRouter.post('/collect/stream', collectorController.startStream);
  apiRouter.post('/collect/historical', collectorController.collectHistorical);
  
  // Account analysis endpoints
  apiRouter.post('/accounts/analyze', accountController.analyzeAccount);
  apiRouter.post('/accounts/batch-analyze', accountController.batchAnalyzeAccounts);
}