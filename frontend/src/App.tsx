import React, { useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Box,
  TextField,
  Button,
  Paper,
  CircularProgress,
  Alert
} from '@mui/material';
import { Dashboard } from './pages/Dashboard';
import { apiService } from './services/api';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1da1f2',
    },
    secondary: {
      main: '#14171a',
    },
  },
});

function App() {
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startAnalysis = async () => {
    if (!keyword.trim()) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.createAnalysis('keyword', { keyword });
      setAnalysisId(data.id);
    } catch (error) {
      console.error('Failed to start analysis:', error);
      setError('Failed to start analysis. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ flexGrow: 1 }}>
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Twitter Spread Analyzer
            </Typography>
          </Toolbar>
        </AppBar>

        <Container maxWidth="xl" sx={{ mt: 4 }}>
          {!analysisId ? (
            <Paper elevation={3} sx={{ p: 4, maxWidth: 600, mx: 'auto' }}>
              <Typography variant="h5" gutterBottom>
                Start New Analysis
              </Typography>
              <Typography variant="body1" color="textSecondary" paragraph>
                Enter a keyword or tweet URL to analyze information spread patterns
              </Typography>
              
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              
              <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
                <TextField
                  fullWidth
                  label="Keyword or Tweet URL"
                  variant="outlined"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  disabled={loading}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      startAnalysis();
                    }
                  }}
                />
                <Button
                  variant="contained"
                  onClick={startAnalysis}
                  disabled={loading || !keyword.trim()}
                  sx={{ minWidth: 120 }}
                >
                  {loading ? <CircularProgress size={24} /> : 'Analyze'}
                </Button>
              </Box>
            </Paper>
          ) : (
            <Dashboard analysisId={analysisId} />
          )}
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default App;