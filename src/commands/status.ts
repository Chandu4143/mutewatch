import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../db.js';
import { DMService } from '../services/dmService.js';

export const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Check details of your active timeouts');

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;

  try {
    // Find active timeouts in DB
    const activeTimeouts = await prisma.timeout.findMany({
      where: {
        userId,
        active: true,
        timeoutEnd: { gt: new Date() },
      },
    });

    if (activeTimeouts.length === 0) {
      await interaction.reply({
        content: '✅ You currently have no active timeouts tracked by MuteWatch.',
        ephemeral: true,
      });
      return;
    }

    if (activeTimeouts.length === 1) {
      const timeout = activeTimeouts[0];
      const guild = await interaction.client.guilds.fetch(timeout.guildId).catch(() => null);
      const guildName = guild ? guild.name : 'Unknown Server';
      
      const payload = DMService.buildStatusDM(guildName, timeout.guildId, timeout.timeoutEnd.getTime());
      await interaction.reply({ ...payload, ephemeral: true });
      return;
    }

    // Multiple active timeouts - present selection buttons
    const embed = new EmbedBuilder()
      .setColor('#FF9900')
      .setTitle('🔇 Multiple Active Timeouts Detected')
      .setDescription('You have active timeouts in multiple servers. Select a server below to check its status:')
      .setTimestamp();

    const buttons = [];
    for (const timeout of activeTimeouts.slice(0, 5)) { // Max 5 buttons in an ActionRow
      const guild = await interaction.client.guilds.fetch(timeout.guildId).catch(() => null);
      const guildName = guild ? guild.name : `Server ID: ${timeout.guildId}`;
      
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`status_btn:${timeout.guildId}`)
          .setLabel(guildName.substring(0, 80)) // Label length constraint
          .setStyle(ButtonStyle.Secondary)
      );
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in /status command:', error);
    await interaction.reply({
      content: '❌ An error occurred while checking your status.',
      ephemeral: true,
    });
  }
}
