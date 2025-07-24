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
  Stack
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
    setLoading(true);
    setError(null);
    
    try {
      const result = await apiService.getAnalysisResults(id);
      setAnalysis(result);
      
      // Extract data for visualizations
      if (result.summary) {
        // Mock network data for now
        setNetworkData({
          nodes: result.summary.topInfluencers?.map((inf: any) => ({
            id: inf.accountId,
            accountId: inf.accountId,
            type: inf.role === 'originator' ? 'source' : 'spreader',
            influence: inf.score,
            connections: [],
            timestamp: new Date()
          })) || [],
          edges: []
        });
        
        // Mock timeline data
        setTimeline([
          {
            id: '1',
            timestamp: new Date(),
            type: 'original',
            accountId: 'user1',
            cascadeDepth: 0
          }
        ]);
      }
    } catch (err) {
      setError('Failed to load analysis data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
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
          Select an analysis to view results
        </Typography>
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
                Total Accounts
              </Typography>
              <Typography variant="h4">
                {analysis.summary?.metrics?.totalAccounts || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Bot Accounts
              </Typography>
              <Typography variant="h4" color="error">
                {analysis.summary?.botAnalysis?.confirmed || 0}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {analysis.summary?.botAnalysis?.percentage?.toFixed(1) || 0}% of total
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Coordination Patterns
              </Typography>
              <Typography variant="h4" color="warning.main">
                {analysis.summary?.coordination?.patternsDetected || 0}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {analysis.summary?.coordination?.totalAccountsInvolved || 0} accounts involved
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Anomalies Detected
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h4">
                  {analysis.summary?.anomalies?.total || 0}
                </Typography>
                {analysis.summary?.anomalies?.critical > 0 && (
                  <Chip 
                    label={`${analysis.summary.anomalies.critical} critical`} 
                    color="error" 
                    size="small"
                  />
                )}
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
                Top Anomalies
              </Typography>
              {analysis.details.anomalies?.slice(0, 5).map((anomaly: any, idx: number) => (
                <Box key={idx} sx={{ mb: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip 
                      label={anomaly.severity} 
                      color={anomaly.severity === 'critical' ? 'error' : 'warning'}
                      size="small"
                    />
                    <Typography variant="body2">
                      {anomaly.description}
                    </Typography>
                  </Stack>
                </Box>
              ))}
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Coordination Signals
              </Typography>
              {analysis.details.coordination?.slice(0, 5).map((coord: any, idx: number) => (
                <Box key={idx} sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    <strong>{coord.coordination_type}:</strong> {coord.user_ids?.length || 0} accounts
                    (Confidence: {(coord.confidence * 100).toFixed(0)}%)
                  </Typography>
                </Box>
              ))}
            </Paper>
          </Grid>
        </Grid>
      )}
    </Container>
  );
};