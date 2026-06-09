import { Collection, REST, Routes } from 'discord.js';
import { config } from '../config.js';
import * as setup from './setup.js';
import * as settings from './settings.js';
import * as testdm from './testdm.js';
import * as status from './status.js';
import * as appeal from './appeal.js';
import * as help from './help.js';

export const commands = new Collection<string, any>();

const commandList = [setup, settings, testdm, status, appeal, help];

for (const cmd of commandList) {
  commands.set(cmd.data.name, cmd);
}

/**
 * Registers all commands globally with Discord REST API
 */
export async function registerCommands() {
  if (!config.discordToken || !config.clientId) {
    console.warn('[Register Commands] DISCORD_TOKEN or CLIENT_ID is missing. Skipping command registration.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const body = commandList.map(cmd => cmd.data.toJSON());

  try {
    console.log(`[Register Commands] Started refreshing ${body.length} application (/) commands.`);
    
    const data: any = await rest.put(
      Routes.applicationCommands(config.clientId),
      { body }
    );

    console.log(`[Register Commands] Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error('[Register Commands] Error registering application commands:', error);
  }
}
