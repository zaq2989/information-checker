import { Router } from 'express';
import * as analysisController from './controllers/analysisController';
import * as collectorController from './controllers/collectorController';
import * as accountController from './controllers/accountController';

export const apiRouter = Router();

// Analysis endpoints
apiRouter.post('/analysis', analysisController.createAnalysis);
apiRouter.get('/analysis/:id', analysisController.getAnalysis);
apiRouter.get('/analysis/:id/results', analysisController.getAnalysisResults);

// Data collection endpoints
apiRouter.post('/collect/tweet', collectorController.collectTweet);
apiRouter.post('/collect/stream', collectorController.startStream);
apiRouter.post('/collect/historical', collectorController.collectHistorical);

// Account analysis endpoints
apiRouter.post('/accounts/analyze', accountController.analyzeAccount);
apiRouter.post('/accounts/batch-analyze', accountController.batchAnalyzeAccounts);