import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';
import * as readyEvent from './events/ready.js';
import * as guildMemberUpdateEvent from './events/guildMemberUpdate.js';
import * as interactionCreateEvent from './events/interactionCreate.js';
import * as messageCreateEvent from './events/messageCreate.js';

// Verify token exists
if (!config.discordToken) {
  console.error('[Error] DISCORD_TOKEN is not defined in environment variables! Please set it in your .env file.');
  process.exit(1);
}

// Initialize the Discord Client with required Intents and Partials
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,        // Privileged intent to detect timeouts via guildMemberUpdate
    GatewayIntentBits.DirectMessages,      // Core requirement to send/receive DMs
    GatewayIntentBits.MessageContent       // Privileged intent to parse text commands in DMs
  ],
  partials: [
    Partials.Channel,                      // Required for DM channels (especially in v14)
    Partials.Message,                      // Required to receive uncached messages
    Partials.User,                         // Required to fetch uncached users
    Partials.GuildMember                   // Required to receive guildMemberUpdate for uncached members
  ]
});

// Bind Event Handlers
const events = [readyEvent, guildMemberUpdateEvent, interactionCreateEvent, messageCreateEvent];

for (const event of events) {
  const eventObj = event as any;
  if (eventObj.once) {
    client.once(eventObj.name, (...args: any[]) => eventObj.execute(...args));
  } else {
    client.on(eventObj.name, (...args: any[]) => eventObj.execute(...args));
  }
}

// Global error handling to prevent bot crashes
process.on('unhandledRejection', error => {
  console.error('[Unhandled Rejection]', error);
});

process.on('uncaughtException', error => {
  console.error('[Uncaught Exception]', error);
});

// Login to Discord
client.login(config.discordToken).catch(error => {
  console.error('[Bot Login Failed] Error logging into Discord:', error);
});
