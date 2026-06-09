import { Message, Events, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../db.js';
import { DMService } from '../services/dmService.js';
import { getHelpMessage } from '../commands/help.js';
import { TimeoutScheduler } from '../services/timeoutScheduler.js';

export const name = Events.MessageCreate;

export async function execute(message: Message) {
  // Ignore bots
  if (message.author.bot) return;

  // Only handle Direct Messages
  const isDM = message.channel.type === ChannelType.DM;
  if (!isDM) return;

  const content = message.content.trim().toLowerCase();
  const userId = message.author.id;
  const client = message.client;

  // Command: Help
  if (content === 'help' || content === '/help') {
    await message.reply({ content: getHelpMessage() });
    return;
  }

  // Command: Status
  if (content === 'status' || content === '/status') {
    try {
      // Sync timeouts first to ensure fresh data
      await TimeoutScheduler.syncUserActiveTimeouts(client, userId);

      const activeTimeouts = await prisma.timeout.findMany({
        where: {
          userId,
          active: true,
          timeoutEnd: { gt: new Date() },
        },
      });

      if (activeTimeouts.length === 0) {
        await message.reply({ content: '✅ You currently have no active timeouts tracked by MuteWatch.' });
        return;
      }

      if (activeTimeouts.length === 1) {
        const timeout = activeTimeouts[0];
        const guild = await client.guilds.fetch(timeout.guildId).catch(() => null);
        const guildName = guild ? guild.name : 'Unknown Server';
        
        const payload = DMService.buildStatusDM(guildName, timeout.guildId, timeout.timeoutEnd.getTime());
        await message.reply(payload);
        return;
      }

      // Multiple active timeouts - show buttons
      const embed = new EmbedBuilder()
        .setColor('#FF9900')
        .setTitle('🔇 Multiple Active Timeouts Detected')
        .setDescription('You have active timeouts in multiple servers. Select a server below to check its status:')
        .setTimestamp();

      const buttons = [];
      for (const timeout of activeTimeouts.slice(0, 5)) {
        const guild = await client.guilds.fetch(timeout.guildId).catch(() => null);
        const guildName = guild ? guild.name : `Server ID: ${timeout.guildId}`;
        
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`status_btn:${timeout.guildId}`)
            .setLabel(guildName.substring(0, 80))
            .setStyle(ButtonStyle.Secondary)
        );
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
      await message.reply({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('Error handling status DM command:', error);
      await message.reply({ content: '❌ An error occurred while retrieving your status.' });
    }
    return;
  }

  // Command: Appeal
  if (content === 'appeal' || content === '/appeal') {
    try {
      // Sync timeouts first to ensure fresh data
      await TimeoutScheduler.syncUserActiveTimeouts(client, userId);

      const activeTimeouts = await prisma.timeout.findMany({
        where: {
          userId,
          active: true,
          timeoutEnd: { gt: new Date() },
        },
      });

      if (activeTimeouts.length === 0) {
        await message.reply({ content: '❌ You currently have no active timeouts to appeal.' });
        return;
      }

      if (activeTimeouts.length === 1) {
        const timeout = activeTimeouts[0];
        
        // Check if guild has appeal channel configured
        const settings = await prisma.guildSettings.findUnique({
          where: { guildId: timeout.guildId },
        });

        if (!settings || !settings.appealChannelId) {
          await message.reply({
            content: '❌ This server has not configured an appeals channel. Please contact a server administrator directly.',
          });
          return;
        }

        const guild = await client.guilds.fetch(timeout.guildId).catch(() => null);
        const guildName = guild ? guild.name : 'Unknown Server';

        const embed = new EmbedBuilder()
          .setColor('#00AAFF')
          .setTitle(`📩 Appeal Timeout in ${guildName}`)
          .setDescription('Click the button below to fill out the appeal form.')
          .setTimestamp();

        const button = new ButtonBuilder()
          .setCustomId(`start_appeal_btn:${timeout.guildId}`)
          .setLabel('Start Appeal')
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

        await message.reply({ embeds: [embed], components: [row] });
        return;
      }

      // Multiple active timeouts
      const embed = new EmbedBuilder()
        .setColor('#FF9900')
        .setTitle('📩 Select Server to Appeal')
        .setDescription('You have active timeouts in multiple servers. Select which server you would like to appeal in:')
        .setTimestamp();

      const buttons = [];
      for (const timeout of activeTimeouts.slice(0, 5)) {
        const guild = await client.guilds.fetch(timeout.guildId).catch(() => null);
        const guildName = guild ? guild.name : `Server ID: ${timeout.guildId}`;
        
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`start_appeal_btn:${timeout.guildId}`)
            .setLabel(`Appeal: ${guildName.substring(0, 60)}`)
            .setStyle(ButtonStyle.Primary)
        );
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
      await message.reply({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('Error handling appeal DM command:', error);
      await message.reply({ content: '❌ An error occurred while preparing your appeal.' });
    }
    return;
  }

  // Any other text - send Help Menu as default response
  await message.reply({
    content: `👋 Hello! I am **MuteWatch**, a bot designed to assist timed-out server members.\n\n${getHelpMessage()}`,
  });
}
