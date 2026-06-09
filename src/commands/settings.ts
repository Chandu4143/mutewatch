import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('settings')
  .setDescription('View current MuteWatch server settings')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: 'This command can only be used inside a server.', ephemeral: true });
    return;
  }

  try {
    const settings = await prisma.guildSettings.findUnique({
      where: { guildId },
    });

    if (!settings || !settings.appealChannelId) {
      await interaction.reply({
        content: '⚠️ MuteWatch is not set up yet. Run `/setup` to configure an appeal channel!',
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: `⚙️ **MuteWatch Server Configuration**\n\n• **Appeal Channel:** <#${settings.appealChannelId}>\n• **Database Sync:** Active`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in /settings:', error);
    await interaction.reply({
      content: '❌ An error occurred while fetching the settings.',
      ephemeral: true,
    });
  }
}
