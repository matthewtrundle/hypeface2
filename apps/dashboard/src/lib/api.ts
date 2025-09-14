import axios, { AxiosInstance } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include auth token
    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Handle unauthorized
          this.token = null;
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('token');
  }

  loadToken() {
    const token = localStorage.getItem('token');
    if (token) {
      this.token = token;
    }
  }

  // Auth endpoints
  async login(username: string, password: string) {
    const response = await this.client.post('/auth/login', { username, password });
    this.setToken(response.data.token);
    return response.data;
  }

  async logout() {
    await this.client.post('/auth/logout');
    this.clearToken();
  }

  async getMe() {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  // Dashboard endpoints
  async getDashboardData() {
    const response = await this.client.get('/api/dashboard');
    return response.data;
  }

  async getPositions() {
    const response = await this.client.get('/api/positions');
    return response.data;
  }

  async getTrades(limit = 100, offset = 0) {
    const response = await this.client.get('/api/trades', {
      params: { limit, offset },
    });
    return response.data;
  }

  async getBalance() {
    const response = await this.client.get('/api/wallet/balance');
    return response.data;
  }

  async closePosition(positionId: string) {
    const response = await this.client.post(`/api/positions/${positionId}/close`);
    return response.data;
  }

  async getSystemStatus() {
    const response = await this.client.get('/api/system/status');
    return response.data;
  }

  // Webhook endpoints (for testing)
  async sendTestWebhook(action: 'buy' | 'sell', symbol: string) {
    const response = await this.client.post('/webhooks/test', {
      action,
      symbol,
      strategy: 'manual-test',
    });
    return response.data;
  }

  async getSignalStatus(signalId: string) {
    const response = await this.client.get(`/webhooks/status/${signalId}`);
    return response.data;
  }
}

export const api = new ApiClient();