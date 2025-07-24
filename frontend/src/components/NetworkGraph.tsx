import React, { useEffect, useRef, useState } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import { NetworkData } from '../types';
import { Box, Paper, Typography, Chip, Stack } from '@mui/material';

interface NetworkGraphProps {
  data: NetworkData;
  onNodeClick?: (nodeId: string) => void;
  height?: string;
}

export const NetworkGraph: React.FC<NetworkGraphProps> = ({ 
  data, 
  onNodeClick,
  height = '600px' 
}) => {
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const elements = [
    // Nodes
    ...data.nodes.map(node => ({
      data: { 
        id: node.accountId,
        label: node.accountId.substring(0, 8) + '...',
        type: node.type,
        influence: node.influence
      },
      classes: node.type
    })),
    // Edges
    ...data.edges.map(edge => ({
      data: {
        id: `${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        weight: edge.weight
      },
      classes: edge.type
    }))
  ];

  const stylesheet: cytoscape.Stylesheet[] = [
    {
      selector: 'node',
      style: {
        'background-color': '#666',
        'label': 'data(label)',
        'width': 'mapData(influence, 0, 100, 20, 60)',
        'height': 'mapData(influence, 0, 100, 20, 60)',
        'font-size': '10px',
        'text-valign': 'center',
        'text-halign': 'center',
        'overlay-opacity': 0
      }
    },
    {
      selector: 'node.source',
      style: {
        'background-color': '#ff4444',
        'width': 80,
        'height': 80,
        'font-size': '12px',
        'font-weight': 'bold'
      }
    },
    {
      selector: 'node.spreader',
      style: {
        'background-color': '#4444ff'
      }
    },
    {
      selector: 'node.endpoint',
      style: {
        'background-color': '#44ff44'
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 'mapData(weight, 0, 3, 1, 5)',
        'line-color': '#ccc',
        'target-arrow-color': '#ccc',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'opacity': 0.7
      }
    },
    {
      selector: 'edge.retweet',
      style: {
        'line-color': '#4CAF50',
        'target-arrow-color': '#4CAF50'
      }
    },
    {
      selector: 'edge.quote',
      style: {
        'line-color': '#2196F3',
        'target-arrow-color': '#2196F3'
      }
    },
    {
      selector: 'edge.reply',
      style: {
        'line-color': '#FF9800',
        'target-arrow-color': '#FF9800'
      }
    },
    {
      selector: ':selected',
      style: {
        'background-color': '#ffcc00',
        'line-color': '#ffcc00',
        'target-arrow-color': '#ffcc00',
        'z-index': 999
      }
    }
  ];

  const layout = {
    name: 'cose',
    animate: true,
    animationDuration: 1000,
    nodeRepulsion: 400000,
    idealEdgeLength: 100,
    edgeElasticity: 100,
    nestingFactor: 5,
    gravity: 80,
    numIter: 1000,
    initialTemp: 200,
    coolingFactor: 0.95,
    minTemp: 1.0
  };

  useEffect(() => {
    if (cyRef.current) {
      cyRef.current.on('tap', 'node', (evt) => {
        const nodeId = evt.target.id();
        setSelectedNode(nodeId);
        if (onNodeClick) {
          onNodeClick(nodeId);
        }
      });

      cyRef.current.on('tap', (evt) => {
        if (evt.target === cyRef.current) {
          setSelectedNode(null);
        }
      });
    }
  }, [onNodeClick]);

  const stats = {
    totalNodes: data.nodes.length,
    totalEdges: data.edges.length,
    sourceNodes: data.nodes.filter(n => n.type === 'source').length,
    spreaderNodes: data.nodes.filter(n => n.type === 'spreader').length
  };

  return (
    <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Network Visualization
        </Typography>
        <Stack direction="row" spacing={1}>
          <Chip label={`Nodes: ${stats.totalNodes}`} size="small" />
          <Chip label={`Edges: ${stats.totalEdges}`} size="small" />
          <Chip 
            label={`Sources: ${stats.sourceNodes}`} 
            size="small" 
            color="error" 
          />
          <Chip 
            label={`Spreaders: ${stats.spreaderNodes}`} 
            size="small" 
            color="primary" 
          />
        </Stack>
      </Box>

      <Box sx={{ height, position: 'relative' }}>
        <CytoscapeComponent
          elements={elements}
          style={{ width: '100%', height: '100%' }}
          stylesheet={stylesheet}
          layout={layout}
          cy={(cy) => { cyRef.current = cy }}
        />
      </Box>

      {selectedNode && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2">
            Selected Node: {selectedNode}
          </Typography>
        </Box>
      )}
    </Paper>
  );
};