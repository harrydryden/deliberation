import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.logLevel,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(config.env === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
});

// Request logging middleware
export function createRequestLogger() {
  return (request: any, reply: any, done: any) => {
    const startTime = Date.now();
    
    reply.on('response', () => {
      const responseTime = Date.now() - startTime;
      
      logger.info({
        traceId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      }, 'Request completed');
    });
    
    done();
  };
}

// Structured error logging
export function logError(error: Error, context?: Record<string, any>) {
  logger.error({
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  }, 'Error occurred');
}

// Token usage logging for AI services
export function logTokenUsage(params: {
  traceId: string;
  service: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latency: number;
  cost?: number;
}) {
  logger.info({
    type: 'token_usage',
    ...params,
  }, 'AI service token usage');
}