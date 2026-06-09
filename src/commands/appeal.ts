import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../db.js';
import { AppealService } from '../services/appealService.js';

export const data = new SlashCommandBuilder()
  .setName('appeal')
  .setDescription('Start the appeal process for your timeout');

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;

  try {
    // 1. Fetch active timeouts
    const activeTimeouts = await prisma.timeout.findMany({
      where: {
        userId,
        active: true,
        timeoutEnd: { gt: new Date() },
      },
    });

    if (activeTimeouts.length === 0) {
      await interaction.reply({
        content: '❌ You currently have no active timeouts to appeal.',
        ephemeral: true,
      });
      return;
    }

    if (activeTimeouts.length === 1) {
      const timeout = activeTimeouts[0];
      
      // Check if guild has appeal channel configured
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: timeout.guildId },
      });

      if (!settings || !settings.appealChannelId) {
        await interaction.reply({
          content: '❌ This server has not configured an appeals channel. Please contact a server administrator directly.',
          ephemeral: true,
        });
        return;
      }

      // Show the modal directly!
      await AppealService.showAppealModal(interaction, timeout.guildId);
      return;
    }

    // 2. Multiple active timeouts - show selection buttons
    const embed = new EmbedBuilder()
      .setColor('#FF9900')
      .setTitle('📩 Select Server to Appeal')
      .setDescription('You have active timeouts in multiple servers. Select which server you would like to appeal in:')
      .setTimestamp();

    const buttons = [];
    for (const timeout of activeTimeouts.slice(0, 5)) { // Max 5 buttons in an ActionRow
      const guild = await interaction.client.guilds.fetch(timeout.guildId).catch(() => null);
      const guildName = guild ? guild.name : `Server ID: ${timeout.guildId}`;
      
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`start_appeal_btn:${timeout.guildId}`)
          .setLabel(`Appeal: ${guildName.substring(0, 60)}`)
          .setStyle(ButtonStyle.Primary)
      );
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in /appeal command:', error);
    await interaction.reply({
      content: '❌ An error occurred while initiating your appeal.',
      ephemeral: true,
    });
  }
}
