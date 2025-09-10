import React, { useState, useEffect } from 'react';
import {
  Container,
  Grid,
  Box,
  Typography,
  CircularProgress,
  Alert,
  Tab,
  Tabs,
  Paper,
  Card,
  CardContent,
  Chip,
  Stack,
  LinearProgress
} from '@mui/material';
import { NetworkGraph } from '../components/NetworkGraph';
import { SpreadTimeline } from '../components/SpreadTimeline';
import { ActivityHeatmap } from '../components/ActivityHeatmap';
import { apiService } from '../services/api';
import { NetworkData, TimelineEvent } from '../types';

interface DashboardProps {
  analysisId?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ analysisId }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Initializing analysis...');
  
  const [analysis, setAnalysis] = useState<any>(null);
  const [networkData, setNetworkData] = useState<NetworkData | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    if (analysisId) {
      loadAnalysisData(analysisId);
    }
  }, [analysisId]);

  const loadAnalysisData = async (id: string) => {
    if (!id) {
      console.error('No analysis ID provided');
      setError('No analysis ID provided');
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(0);
    setStatusMessage('Connecting to analysis service...');
    
    try {
      // Poll for results since analysis may take time
      let attempts = 0;
      let result = null;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        try {
          const progressValue = Math.min((attempts / maxAttempts) * 80, 80);
          setProgress(progressValue); // Progress up to 80%
          setStatusMessage(`Fetching analysis results... (${attempts + 1}/${maxAttempts})`);
          
          console.log(`Fetching analysis ${id}, attempt ${attempts + 1}`);
          
          // Add timeout to prevent hanging
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), 5000)
          );
          
          result = await Promise.race([
            apiService.getAnalysisResults(id),
            timeoutPromise
          ]);
          
          console.log('Analysis result:', result);
          
          if (result && result.status === 'completed') {
            setProgress(90);
            setStatusMessage('Processing results...');
            break;
          } else if (result && result.status === 'pending') {
            console.log('Analysis still pending, waiting...');
          } else if (!result) {
            console.warn('Empty result received');
          }
        } catch (fetchError: any) {
          console.error(`Fetch attempt ${attempts + 1} failed:`, fetchError);
          // Don't throw error immediately, continue trying
          if (attempts === maxAttempts - 1) {
            throw new Error(`Failed to fetch analysis after ${maxAttempts} attempts: ${fetchError.message || 'Network error'}`);
          }
        }
        
        // Wait 1 second before next attempt
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
      
      if (!result) {
        throw new Error('Failed to get analysis results. Please try again.');
      }
      
      if (result.status !== 'completed') {
        console.warn('Analysis not completed, showing partial results');
        setError('Analysis is still processing. Showing partial results.');
      }
      
      setProgress(95);
      setStatusMessage('Rendering visualizations...');
      setAnalysis(result || {});
      
      // Extract data for visualizations based on mock data structure
      if (result?.details?.networkGraph) {
        try {
          const networkNodes = result.details.networkGraph.nodes || [];
          const networkEdges = result.details.networkGraph.edges || [];
          
          // Log data for debugging
          console.log('Network nodes:', networkNodes.slice(0, 2));
          console.log('Network edges:', networkEdges.slice(0, 2));
          
          setNetworkData({
            nodes: networkNodes.map((node: any) => ({
              id: node.id || '',  // Use the node.id directly from backend
              accountId: node.label || 'unknown',
              type: node.color === '#ff0000' ? 'bot' : 'normal',
              influence: node.size || 0,
              connections: [],
              timestamp: new Date()
            })),
            edges: networkEdges.filter((edge: any) => {
              // Filter out edges with invalid references
              const hasValidSource = edge.source && networkNodes.some((n: any) => n.id === edge.source);
              const hasValidTarget = edge.target && networkNodes.some((n: any) => n.id === edge.target);
              if (!hasValidSource || !hasValidTarget) {
                console.warn(`Skipping edge with invalid nodes: ${edge.source} -> ${edge.target}`);
                return false;
              }
              return true;
            }).map((edge: any) => ({
              source: edge.source || '',
              target: edge.target || '',
              weight: edge.weight || 0
            }))
          });
        } catch (err) {
          console.error('Error processing network graph:', err);
        }
      }
      
      // Extract timeline from tweets
      if (result?.details?.tweets) {
        try {
          const tweets = result.details.tweets || [];
          setTimeline(tweets.slice(0, 10).map((tweet: any, idx: number) => ({
            id: tweet.id || `tweet-${idx}`,
            timestamp: new Date(tweet.createdAt || Date.now()),
            type: idx === 0 ? 'original' : 'retweet',
            accountId: tweet.author?.username || 'unknown',
            cascadeDepth: idx
          })));
        } catch (err) {
          console.error('Error processing timeline:', err);
        }
      }
      
      // Extract activity data
      if (result?.details?.tweets) {
        try {
          const activityMap = new Map();
          const tweets = result.details.tweets || [];
          
          tweets.forEach((tweet: any) => {
            if (tweet.createdAt) {
              const hour = new Date(tweet.createdAt).getHours();
              const day = new Date(tweet.createdAt).getDay();
              const key = `${day}-${hour}`;
              activityMap.set(key, (activityMap.get(key) || 0) + 1);
            }
          });
          
          const activities = Array.from(activityMap.entries()).map(([key, value]) => {
            const [day, hour] = key.split('-').map(Number);
            return { day, hour, value };
          });
          setActivities(activities);
        } catch (err) {
          console.error('Error processing activities:', err);
        }
      }
      
      setProgress(100);
      setStatusMessage('Analysis complete!');
      
      // Clear progress bar after a short delay
      setTimeout(() => {
        setProgress(0);
        setStatusMessage('');
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to load analysis data');
      console.error('Analysis error:', err);
      setProgress(0);
      setStatusMessage('');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 8 }}>
        <Paper elevation={3} sx={{ p: 4 }}>
          <Box sx={{ width: '100%' }}>
            <Typography variant="h6" gutterBottom align="center">
              Analyzing Information Spread
            </Typography>
            <Typography variant="body2" color="textSecondary" align="center" sx={{ mb: 3 }}>
              {statusMessage}
            </Typography>
            <LinearProgress variant="determinate" value={progress} sx={{ mb: 2, height: 8, borderRadius: 4 }} />
            <Typography variant="body2" align="center" color="textSecondary">
              {progress}% Complete
            </Typography>
          </Box>
        </Paper>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  if (!analysis) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Typography variant="h5" color="textSecondary">
          No analysis data available
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
          Please start a new analysis by entering a keyword.
        </Typography>
      </Container>
    );
  }

  // Ensure analysis object exists before rendering
  if (!analysis || Object.keys(analysis).length === 0) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="info">Loading analysis data...</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Tweets
              </Typography>
              <Typography variant="h4">
                {analysis?.summary?.totalTweets || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Bot Percentage
              </Typography>
              <Typography variant="h4" color="error">
                {analysis.summary?.botPercentage?.toFixed(0) || 0}%
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Detected bot accounts
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Average Engagement
              </Typography>
              <Typography variant="h4" color="primary">
                {Math.round(analysis.summary?.averageEngagement || 0)}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Per tweet
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Sentiment
              </Typography>
              <Stack spacing={0.5}>
                <Typography variant="body2">
                  Positive: {analysis.summary?.sentimentDistribution?.positive || 0}
                </Typography>
                <Typography variant="body2">
                  Negative: {analysis.summary?.sentimentDistribution?.negative || 0}
                </Typography>
                <Typography variant="body2">
                  Neutral: {analysis.summary?.sentimentDistribution?.neutral || 0}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Visualization Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab label="Network Graph" />
          <Tab label="Timeline" />
          <Tab label="Activity Patterns" />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      <Box sx={{ mt: 3 }}>
        {tabValue === 0 && networkData && (
          <NetworkGraph 
            data={networkData}
            height="600px"
            onNodeClick={(nodeId) => console.log('Node clicked:', nodeId)}
          />
        )}
        
        {tabValue === 1 && (
          <SpreadTimeline 
            events={timeline}
            height={500}
          />
        )}
        
        {tabValue === 2 && (
          <ActivityHeatmap 
            activities={activities}
            height={400}
          />
        )}
      </Box>

      {/* Detailed Results */}
      {analysis.details && (
        <Grid container spacing={3} sx={{ mt: 3 }}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Top Spreaders
              </Typography>
              {analysis.summary?.topSpreaders?.slice(0, 5).map((spreader: any, idx: number) => (
                <Box key={idx} sx={{ mb: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography variant="body2">
                      @{spreader.username}
                    </Typography>
                    <Chip 
                      label={`Score: ${(spreader.score * 100).toFixed(0)}%`} 
                      color="primary"
                      size="small"
                    />
                  </Stack>
                </Box>
              ))}
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Recent Tweets
              </Typography>
              {analysis.details?.tweets?.slice(0, 3).map((tweet: any, idx: number) => (
                <Box key={idx} sx={{ mb: 2, pb: 1, borderBottom: '1px solid #eee' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="body2">
                      <strong>@{tweet.author.username}</strong>
                      {tweet.author.verified && ' ✓'}
                    </Typography>
                    {tweet.isBot && (
                      <Chip label="BOT" color="error" size="small" sx={{ ml: 1 }} />
                    )}
                  </Box>
                  <Typography variant="body2" color="textSecondary" sx={{ mb: 0.5 }}>
                    {tweet.text}
                  </Typography>
                  <Stack direction="row" spacing={2}>
                    <Typography variant="caption">
                      ❤️ {tweet.metrics.likes}
                    </Typography>
                    <Typography variant="caption">
                      🔁 {tweet.metrics.retweets}
                    </Typography>
                    <Typography variant="caption">
                      💬 {tweet.metrics.replies}
                    </Typography>
                  </Stack>
                </Box>
              ))}
            </Paper>
          </Grid>
        </Grid>
      )}
    </Container>
  );
};