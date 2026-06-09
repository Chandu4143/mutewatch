import { CommandInteraction, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('View MuteWatch commands and instructions');

export function getHelpMessage(): string {
  return `ℹ️ **MuteWatch Help & Commands**\n\nMuteWatch is built to keep you informed about your active server punishments and handle appeals.\n\n**DM Commands:**\n• \`/status\` (or type \`status\`) - Check details of your active timeouts.\n• \`/appeal\` (or type \`appeal\`) - Start the timeout appeal process.\n• \`/help\` (or type \`help\`) - View this help menu.\n\n**Server Commands (Administrators only):**\n• \`/setup\` - Configure the channel for receiving appeals.\n• \`/settings\` - View current bot configuration.\n• \`/testdm\` - Send a test DM to verify delivery.`;
}

export async function execute(interaction: CommandInteraction) {
  await interaction.reply({
    content: getHelpMessage(),
    ephemeral: true,
  });
}
