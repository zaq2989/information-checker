import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiService = {
  // Analysis endpoints
  createAnalysis: async (type: string, parameters: any) => {
    const response = await api.post('/analysis', { type, parameters });
    return response.data;
  },

  getAnalysis: async (id: string) => {
    const response = await api.get(`/analysis/${id}`);
    return response.data;
  },

  getAnalysisResults: async (id: string) => {
    const response = await api.get(`/analysis/${id}/results`);
    return response.data;
  },

  // Collection endpoints
  collectTweet: async (tweetId: string) => {
    const response = await api.post('/collect/tweet', { tweetId });
    return response.data;
  },

  startStream: async (keywords: string[]) => {
    const response = await api.post('/collect/stream', { keywords });
    return response.data;
  },

  // Account analysis
  analyzeAccount: async (accountId: string) => {
    const response = await api.post('/accounts/analyze', { accountId });
    return response.data;
  },

  batchAnalyzeAccounts: async (accountIds: string[]) => {
    const response = await api.post('/accounts/batch-analyze', { accountIds });
    return response.data;
  },
};

// Add request interceptor for auth if needed
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);