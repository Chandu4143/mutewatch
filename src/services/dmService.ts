import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Guild } from 'discord.js';

export class DMService {
  /**
   * Format milliseconds into a human-readable duration (e.g., "6 Days 23 Hours")
   */
  static formatDuration(ms: number): string {
    if (ms <= 0) return '0 Seconds';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const parts = [];
    if (days > 0) parts.push(`${days} Day${days > 1 ? 's' : ''}`);
    if (hours % 24 > 0) parts.push(`${hours % 24} Hour${hours % 24 > 1 ? 's' : ''}`);
    if (minutes % 60 > 0 && days === 0) parts.push(`${minutes % 60} Minute${minutes % 60 > 1 ? 's' : ''}`);
    if (seconds % 60 > 0 && hours === 0) parts.push(`${seconds % 60} Second${seconds % 60 > 1 ? 's' : ''}`);

    return parts.slice(0, 2).join(' ') || 'Just now';
  }

  /**
   * Generates DM payload for a newly applied timeout
   */
  static buildTimeoutDM(guildName: string, guildId: string, endTimestamp: number) {
    const endUnix = Math.floor(endTimestamp / 1000);
    
    const embed = new EmbedBuilder()
      .setColor('#FF5555')
      .setTitle(`🔇 Timed Out in ${guildName}`)
      .setDescription('You have been timed out. Please review the details below.')
      .addFields(
        { name: 'Timeout Ends', value: `<t:${endUnix}:F> (<t:${endUnix}:R>)`, inline: false },
        { name: 'Time Remaining', value: this.formatDuration(endTimestamp - Date.now()), inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'MuteWatch - Punished User Assistant' });

    const statusButton = new ButtonBuilder()
      .setCustomId(`status_btn:${guildId}`)
      .setLabel('Check Status')
      .setStyle(ButtonStyle.Secondary);

    const appealButton = new ButtonBuilder()
      .setCustomId(`appeal_btn:${guildId}`)
      .setLabel('Appeal')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(statusButton, appealButton);

    return { embeds: [embed], components: [row] };
  }

  /**
   * Generates DM payload for timeout status check
   */
  static buildStatusDM(guildName: string, guildId: string, endTimestamp: number) {
    const endUnix = Math.floor(endTimestamp / 1000);
    const msRemaining = endTimestamp - Date.now();
    const isEnded = msRemaining <= 0;

    const embed = new EmbedBuilder()
      .setColor(isEnded ? '#55FF55' : '#FF9900')
      .setTitle(`Status: ${guildName}`)
      .setDescription(isEnded ? '✅ Your timeout has ended!' : '🔇 You are currently timed out.')
      .addFields(
        { name: 'Server Name', value: guildName, inline: true },
        { name: 'Status', value: isEnded ? 'Active/Expired' : 'Timed Out', inline: true },
        { name: 'Expires', value: `<t:${endUnix}:F> (<t:${endUnix}:R>)`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'MuteWatch Status Check' });

    const components = [];
    if (!isEnded) {
      const appealButton = new ButtonBuilder()
        .setCustomId(`appeal_btn:${guildId}`)
        .setLabel('Appeal')
        .setStyle(ButtonStyle.Primary);
      components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(appealButton));
    }

    return { embeds: [embed], components };
  }

  /**
   * Generates DM payload when a timeout naturally expires or is removed early
   */
  static buildExpirationDM(guildName: string, earlyRemoval = false) {
    const embed = new EmbedBuilder()
      .setColor('#55FF55')
      .setTitle(earlyRemoval ? `✅ Timeout Removed early in ${guildName}` : `✅ Timeout Expired in ${guildName}`)
      .setDescription('Your timeout has ended. You can now participate in the server again!')
      .setTimestamp()
      .setFooter({ text: 'MuteWatch Notifications' });

    return { embeds: [embed] };
  }
}
