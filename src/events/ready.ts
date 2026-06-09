import { Client, Events } from 'discord.js';
import { registerCommands } from '../commands/index.js';
import { TimeoutScheduler } from '../services/timeoutScheduler.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client: Client) {
  console.log(`[Bot Ready] Logged in as ${client.user?.tag}! Connected to ${client.guilds.cache.size} servers.`);

  // Register commands globally on startup
  await registerCommands();

  // Start the background expiration check scheduler
  TimeoutScheduler.start(client);
}
