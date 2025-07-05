// Context types for logs
export enum LogContext {
  UI = 'UI',
  WALLET = 'WALLET',
  CONTRACT = 'CONTRACT',
  API = 'API',
  ERROR = 'ERROR'
}

// Interface for log data
interface LogData {
  context: LogContext;
  message: string;
  data?: any;
  error?: Error;
}

// Main logging function
export const logger = {
  info: (message: string, data?: Omit<LogData, 'message'>) => {
    console.log(`[INFO] ${message}`, data);
  },
  
  warn: (message: string, data?: Omit<LogData, 'message'>) => {
    console.warn(`[WARN] ${message}`, data);
  },
  
  error: (message: string, data?: Omit<LogData, 'message'>) => {
    console.error(`[ERROR] ${message}`, data);
  },
  
  debug: (message: string, data?: Omit<LogData, 'message'>) => {
    if (import.meta.env.DEV) {
      console.debug(`[DEBUG] ${message}`, data);
    }
  }
}; 