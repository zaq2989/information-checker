import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
  ComposedChart,
  Bar
} from 'recharts';
import { TimelineEvent } from '../types';
import { Box, Paper, Typography, FormControl, Select, MenuItem } from '@mui/material';
import { format } from 'date-fns';

interface SpreadTimelineProps {
  events: TimelineEvent[];
  height?: number;
}

export const SpreadTimeline: React.FC<SpreadTimelineProps> = ({ 
  events, 
  height = 400 
}) => {
  const [viewType, setViewType] = React.useState<'cumulative' | 'rate' | 'cascade'>('cumulative');

  const timelineData = useMemo(() => {
    if (!events || events.length === 0) return [];

    // Sort events by timestamp
    const sortedEvents = [...events].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Group events by time window (5 minutes)
    const windowSize = 5 * 60 * 1000;
    const windows = new Map<number, {
      timestamp: number;
      original: number;
      retweets: number;
      quotes: number;
      replies: number;
      total: number;
      cumulative: number;
      cascadeDepth: number;
    }>();

    let cumulative = 0;
    sortedEvents.forEach(event => {
      const time = new Date(event.timestamp).getTime();
      const windowStart = Math.floor(time / windowSize) * windowSize;
      
      if (!windows.has(windowStart)) {
        windows.set(windowStart, {
          timestamp: windowStart,
          original: 0,
          retweets: 0,
          quotes: 0,
          replies: 0,
          total: 0,
          cumulative: 0,
          cascadeDepth: 0
        });
      }

      const window = windows.get(windowStart)!;
      window.total++;
      cumulative++;
      window.cumulative = cumulative;
      window.cascadeDepth = Math.max(window.cascadeDepth, event.cascadeDepth);

      switch (event.type) {
        case 'original':
          window.original++;
          break;
        case 'retweet':
          window.retweets++;
          break;
        case 'quote':
          window.quotes++;
          break;
        case 'reply':
          window.replies++;
          break;
      }
    });

    return Array.from(windows.values()).map(window => ({
      ...window,
      time: format(new Date(window.timestamp), 'HH:mm')
    }));
  }, [events]);

  const renderChart = () => {
    switch (viewType) {
      case 'cumulative':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="cumulative" 
                stroke="#8884d8" 
                fill="#8884d8" 
                fillOpacity={0.6}
                name="Total Spread"
              />
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'rate':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <ComposedChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="retweets" stackId="a" fill="#4CAF50" />
              <Bar dataKey="quotes" stackId="a" fill="#2196F3" />
              <Bar dataKey="replies" stackId="a" fill="#FF9800" />
              <Line 
                type="monotone" 
                dataKey="total" 
                stroke="#ff4444" 
                strokeWidth={2}
                name="Total Rate"
              />
            </ComposedChart>
          </ResponsiveContainer>
        );

      case 'cascade':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <ComposedChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="total"
                stroke="#8884d8"
                fill="#8884d8"
                fillOpacity={0.3}
                name="Activity"
              />
              <Line
                yAxisId="right"
                type="stepAfter"
                dataKey="cascadeDepth"
                stroke="#ff4444"
                strokeWidth={2}
                name="Cascade Depth"
              />
            </ComposedChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">
          Spread Timeline
        </Typography>
        <FormControl size="small">
          <Select
            value={viewType}
            onChange={(e) => setViewType(e.target.value as any)}
          >
            <MenuItem value="cumulative">Cumulative Spread</MenuItem>
            <MenuItem value="rate">Activity Rate</MenuItem>
            <MenuItem value="cascade">Cascade Depth</MenuItem>
          </Select>
        </FormControl>
      </Box>
      
      {timelineData.length > 0 ? (
        renderChart()
      ) : (
        <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography color="textSecondary">
            No timeline data available
          </Typography>
        </Box>
      )}
    </Paper>
  );
};