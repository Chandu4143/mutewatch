import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

export interface Config {
  discordToken: string;
  clientId: string;
  databaseUrl: string;
}

function getEnvVar(name: string, fallback?: string): string {
  const val = process.env[name] || fallback;
  if (!val) {
    console.warn(`[Config Warning] Missing environment variable: ${name}`);
    return '';
  }
  return val;
}

export const config: Config = {
  discordToken: getEnvVar('DISCORD_TOKEN'),
  clientId: getEnvVar('CLIENT_ID'),
  databaseUrl: getEnvVar('DATABASE_URL', 'file:./dev.db'),
};
