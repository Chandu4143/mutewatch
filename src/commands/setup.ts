import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { prisma } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Configure the appeal channel for MuteWatch')
  .addChannelOption(option =>
    option
      .setName('channel')
      .setDescription('The text channel where user appeals will be sent')
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildText)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: 'This command can only be used inside a server.', ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel', true);

  try {
    await prisma.guildSettings.upsert({
      where: { guildId },
      update: { appealChannelId: channel.id },
      create: { guildId, appealChannelId: channel.id },
    });

    await interaction.reply({
      content: `✅ Successfully configured MuteWatch! Appeals will be forwarded to <#${channel.id}>.`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in /setup:', error);
    await interaction.reply({
      content: '❌ An error occurred while saving the settings. Please try again.',
      ephemeral: true,
    });
  }
}
