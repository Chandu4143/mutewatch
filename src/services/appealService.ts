import { 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ActionRowBuilder, 
  ModalSubmitInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  GuildMember,
  Interaction,
  PermissionFlagsBits
} from 'discord.js';
import { prisma } from '../db.js';

export class AppealService {
  /**
   * Builds and shows the appeal modal for a given guild
   */
  static async showAppealModal(interaction: any, guildId: string) {
    try {
      const modal = new ModalBuilder()
        .setCustomId(`appeal_modal:${guildId}`)
        .setTitle('Submit Timeout Appeal');

      const reasonInput = new TextInputBuilder()
        .setCustomId('appeal_reason')
        .setLabel('Why should your timeout be reconsidered?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('Provide an explanation here...')
        .setMaxLength(1000);

      const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      console.error('Error showing appeal modal:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: '❌ Failed to load the appeal form.', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ Failed to load the appeal form.', ephemeral: true });
      }
    }
  }

  /**
   * Processes the appeal modal submission
   */
  static async handleAppealSubmit(interaction: ModalSubmitInteraction, client: Client) {
    const customId = interaction.customId; // format: "appeal_modal:guildId"
    const guildId = customId.split(':')[1];
    const userId = interaction.user.id;
    const appealReason = interaction.fields.getTextInputValue('appeal_reason');

    await interaction.deferReply({ ephemeral: true });

    try {
      // 1. Check if the guild settings exist and have an appeal channel configured
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId },
      });

      if (!settings || !settings.appealChannelId) {
        await interaction.editReply({
          content: '❌ This server has not configured an appeals channel. Please contact a server moderator directly.',
        });
        return;
      }

      // 2. Log the appeal in the database
      const appeal = await prisma.appeal.create({
        data: {
          guildId,
          userId,
          message: appealReason,
          status: 'PENDING',
        },
      });

      // 3. Fetch the guild and appeal channel
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        await interaction.editReply({
          content: '❌ Could not retrieve server information. Please ensure the bot is still in the server.',
        });
        return;
      }

      const channel = await guild.channels.fetch(settings.appealChannelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        await interaction.editReply({
          content: '❌ Could not locate the configured appeal channel on the server. Please report this to the server administrators.',
        });
        return;
      }

      // 4. Construct the moderator report embed
      const modEmbed = new EmbedBuilder()
        .setColor('#00AAFF')
        .setTitle('📩 New Timeout Appeal Received')
        .setDescription(`An appeal was submitted by <@${userId}>.`)
        .addFields(
          { name: 'User', value: `${interaction.user.tag} (ID: ${userId})`, inline: true },
          { name: 'Server', value: guild.name, inline: true },
          { name: 'Appeal Message', value: appealReason, inline: false },
          { name: 'Appeal ID', value: String(appeal.id), inline: true },
          { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'MuteWatch Appeals System' });

      // Unmute button (removes the timeout on the guild member)
      const unmuteButton = new ButtonBuilder()
        .setCustomId(`unmute_member:${userId}:${guildId}:${appeal.id}`)
        .setLabel('Approve & Unmute')
        .setStyle(ButtonStyle.Success);

      const rejectButton = new ButtonBuilder()
        .setCustomId(`reject_appeal:${userId}:${guildId}:${appeal.id}`)
        .setLabel('Reject Appeal')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(unmuteButton, rejectButton);

      // Send to the moderator channel
      await (channel as any).send({ embeds: [modEmbed], components: [row] });

      await interaction.editReply({
        content: `✅ Your appeal has been submitted successfully to the **${guild.name}** moderation team! You will be notified if your status changes.`,
      });
    } catch (error) {
      console.error('Error handling appeal submit:', error);
      await interaction.editReply({
        content: '❌ An error occurred while processing your appeal. Please try again later.',
      });
    }
  }

  /**
   * Handles mod channel appeal actions (Approve & Unmute, or Reject)
   */
  static async handleModAction(interaction: any, client: Client) {
    const [action, targetUserId, guildId, appealId] = interaction.customId.split(':');
    
    // Check if the user is a moderator/administrator in the guild
    const member = interaction.member as GuildMember;
    if (!member || !member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      await interaction.reply({
        content: '❌ You must have "Moderate Members" permission to take actions on appeals.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();

    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        await interaction.followUp({ content: '❌ Could not retrieve server information.', ephemeral: true });
        return;
      }

      const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
      const appealIdInt = parseInt(appealId, 10);

      if (action === 'unmute_member') {
        if (!targetMember) {
          await interaction.followUp({ content: '❌ Target member is no longer in the server.', ephemeral: true });
          return;
        }

        // Verify bot has permissions
        const botMember = await guild.members.fetch(client.user!.id).catch(() => null);
        if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          await interaction.followUp({
            content: '❌ I do not have permission ("Moderate Members") to unmute this user.',
            ephemeral: true,
          });
          return;
        }

        // Remove the native timeout
        await targetMember.timeout(null, `Appeal approved by ${interaction.user.tag}`);

        // Update database
        await prisma.appeal.update({
          where: { id: appealIdInt },
          data: { status: 'APPROVED' },
        });

        await prisma.timeout.updateMany({
          where: { guildId, userId: targetUserId, active: true },
          data: { active: false },
        });

        // Edit mod message to reflect action
        const origEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
        origEmbed.setColor('#55FF55')
          .setTitle('✅ Timeout Appeal Approved & Unmuted')
          .addFields({ name: 'Action By', value: `${interaction.user.tag}`, inline: true });
        
        await interaction.message.edit({ embeds: [origEmbed], components: [] });

        // Notify user in DM
        try {
          await targetMember.send({
            content: `🎉 **Your appeal was approved!** You have been unmuted in **${guild.name}** and can now participate again.`,
          });
        } catch {
          console.log(`Could not DM user ${targetUserId} about appeal approval.`);
        }
      } else if (action === 'reject_appeal') {
        // Update database
        await prisma.appeal.update({
          where: { id: appealIdInt },
          data: { status: 'REJECTED' },
        });

        // Edit mod message to reflect action
        const origEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
        origEmbed.setColor('#FF5555')
          .setTitle('❌ Timeout Appeal Rejected')
          .addFields({ name: 'Action By', value: `${interaction.user.tag}`, inline: true });

        await interaction.message.edit({ embeds: [origEmbed], components: [] });

        // Notify user in DM
        try {
          const user = await client.users.fetch(targetUserId).catch(() => null);
          if (user) {
            await user.send({
              content: `❌ **Your appeal in ${guild.name} was reviewed and rejected.** You must serve the remainder of your timeout.`,
            });
          }
        } catch {
          console.log(`Could not DM user ${targetUserId} about appeal rejection.`);
        }
      }
    } catch (error) {
      console.error('Error handling mod action:', error);
      await interaction.followUp({ content: '❌ An error occurred while executing this action.', ephemeral: true });
    }
  }
}
