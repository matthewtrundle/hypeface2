import { useEffect, useRef } from 'react';
import io, { Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

interface UseSocketOptions {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onPositionUpdate?: (position: any) => void;
  onTradeExecuted?: (trade: any) => void;
  onBalanceUpdate?: (balance: any) => void;
  onSystemStatus?: (status: any) => void;
  onAlert?: (alert: any) => void;
}

export function useSocket(options: UseSocketOptions = {}) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');

    if (!token) {
      console.warn('No auth token found, skipping WebSocket connection');
      return;
    }

    // Initialize socket connection
    const socket = io(WS_URL, {
      auth: {
        token,
      },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('WebSocket connected');
      options.onConnect?.();
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      options.onDisconnect?.();
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error.message);
    });

    // Business events
    socket.on('position:update', (position) => {
      console.log('Position update received:', position);
      options.onPositionUpdate?.(position);
    });

    socket.on('trade:executed', (trade) => {
      console.log('Trade executed:', trade);
      options.onTradeExecuted?.(trade);
    });

    socket.on('balance:update', (balance) => {
      console.log('Balance update:', balance);
      options.onBalanceUpdate?.(balance);
    });

    socket.on('system:status', (status) => {
      console.log('System status:', status);
      options.onSystemStatus?.(status);
    });

    socket.on('alert', (alert) => {
      console.log('Alert received:', alert);
      options.onAlert?.(alert);
    });

    // Ping/pong for connection health
    const pingInterval = setInterval(() => {
      socket.emit('ping');
    }, 30000);

    socket.on('pong', (data) => {
      console.log('Pong received:', data);
    });

    // Cleanup
    return () => {
      clearInterval(pingInterval);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    options.onConnect,
    options.onDisconnect,
    options.onPositionUpdate,
    options.onTradeExecuted,
    options.onBalanceUpdate,
    options.onSystemStatus,
    options.onAlert,
  ]);

  const subscribe = (channels: string[]) => {
    if (socketRef.current) {
      socketRef.current.emit('subscribe', channels);
    }
  };

  const unsubscribe = (channels: string[]) => {
    if (socketRef.current) {
      socketRef.current.emit('unsubscribe', channels);
    }
  };

  const requestPositions = () => {
    if (socketRef.current) {
      socketRef.current.emit('get:positions');
    }
  };

  const requestTrades = (limit?: number) => {
    if (socketRef.current) {
      socketRef.current.emit('get:trades', limit);
    }
  };

  const requestBalance = () => {
    if (socketRef.current) {
      socketRef.current.emit('get:balance');
    }
  };

  return {
    socket: socketRef.current,
    subscribe,
    unsubscribe,
    requestPositions,
    requestTrades,
    requestBalance,
  };
}