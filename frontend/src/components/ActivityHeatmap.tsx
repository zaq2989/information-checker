import React, { useMemo } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { scaleLinear } from 'd3-scale';
import { Activity } from '../types';

interface ActivityHeatmapProps {
  activities: Activity[];
  height?: number;
}

interface Activity {
  accountId: string;
  timestamp: Date;
  type: string;
}

export const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({ 
  activities, 
  height = 400 
}) => {
  const heatmapData = useMemo(() => {
    const hourlyData: number[][] = Array(7).fill(null).map(() => Array(24).fill(0));
    
    activities.forEach(activity => {
      const date = new Date(activity.timestamp);
      const day = date.getDay();
      const hour = date.getHours();
      hourlyData[day][hour]++;
    });

    // Normalize data
    const maxValue = Math.max(...hourlyData.flat());
    return hourlyData.map(row => row.map(val => val / maxValue));
  }, [activities]);

  const colorScale = scaleLinear<string>()
    .domain([0, 0.5, 1])
    .range(['#f0f0f0', '#2196F3', '#ff4444']);

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <Paper elevation={3} sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Activity Heatmap
      </Typography>
      
      <Box sx={{ height, overflow: 'auto' }}>
        <svg width="100%" height={height} viewBox="0 0 800 250">
          {/* Y-axis labels (days) */}
          {days.map((day, i) => (
            <text
              key={day}
              x="10"
              y={i * 30 + 50}
              fontSize="12"
              textAnchor="start"
              alignmentBaseline="middle"
            >
              {day}
            </text>
          ))}

          {/* X-axis labels (hours) */}
          {hours.filter((_, i) => i % 3 === 0).map((hour, i) => (
            <text
              key={hour}
              x={60 + i * 90}
              y="20"
              fontSize="12"
              textAnchor="middle"
            >
              {hour}:00
            </text>
          ))}

          {/* Heatmap cells */}
          {heatmapData.map((row, dayIndex) =>
            row.map((value, hourIndex) => (
              <rect
                key={`${dayIndex}-${hourIndex}`}
                x={60 + hourIndex * 30}
                y={35 + dayIndex * 30}
                width="28"
                height="28"
                fill={colorScale(value)}
                stroke="#fff"
                strokeWidth="1"
              >
                <title>
                  {days[dayIndex]} {hourIndex}:00 - Activity: {Math.round(value * 100)}%
                </title>
              </rect>
            ))
          )}

          {/* Legend */}
          <defs>
            <linearGradient id="legend-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f0f0f0" />
              <stop offset="50%" stopColor="#2196F3" />
              <stop offset="100%" stopColor="#ff4444" />
            </linearGradient>
          </defs>
          
          <rect x="60" y="260" width="200" height="20" fill="url(#legend-gradient)" />
          <text x="60" y="295" fontSize="12">Low</text>
          <text x="260" y="295" fontSize="12" textAnchor="end">High</text>
        </svg>
      </Box>
    </Paper>
  );
};