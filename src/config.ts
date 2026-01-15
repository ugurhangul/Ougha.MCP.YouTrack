import { config } from 'dotenv';
import { YouTrackConfig } from './types.js';

// Load environment variables
config();

/**
 * Validates and returns the YouTrack configuration from environment variables
 */
export function getConfig(): YouTrackConfig {
  const url = process.env.YOUTRACK_URL;
  const token = process.env.YOUTRACK_TOKEN;

  if (!url) {
    throw new Error('YOUTRACK_URL environment variable is required');
  }

  if (!token) {
    throw new Error('YOUTRACK_TOKEN environment variable is required');
  }

  // Validate URL format
  try {
    new URL(url);
  } catch (error) {
    throw new Error('YOUTRACK_URL must be a valid URL');
  }

  // Parse optional configuration
  const timeout = process.env.YOUTRACK_TIMEOUT
    ? parseInt(process.env.YOUTRACK_TIMEOUT, 10)
    : 30000;

  const rateLimit = process.env.YOUTRACK_RATE_LIMIT
    ? parseInt(process.env.YOUTRACK_RATE_LIMIT, 10)
    : 60;

  const debug = process.env.DEBUG === 'true';

  if (isNaN(timeout) || timeout <= 0) {
    throw new Error('YOUTRACK_TIMEOUT must be a positive number');
  }

  if (isNaN(rateLimit) || rateLimit <= 0) {
    throw new Error('YOUTRACK_RATE_LIMIT must be a positive number');
  }

  return {
    url: url.replace(/\/$/, ''), // Remove trailing slash
    token,
    timeout,
    rateLimit,
    debug
  };
}

/**
 * Logs configuration info (without sensitive data)
 */
export function logConfigInfo(config: YouTrackConfig): void {
  console.error('Ougha.MCP.YouTrack Configuration:');
  console.error(`  URL: ${config.url}`);
  console.error(`  Timeout: ${config.timeout}ms`);
  console.error(`  Rate Limit: ${config.rateLimit} requests/minute`);
  console.error(`  Debug: ${config.debug}`);
}
