import { Events, Interaction } from 'discord.js';
import { commands } from '../commands/index.js';
import { prisma } from '../db.js';
import { DMService } from '../services/dmService.js';
import { AppealService } from '../services/appealService.js';

export const name = Events.InteractionCreate;

export async function execute(interaction: Interaction) {
  const client = interaction.client;

  // 1. Handle Slash Commands
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (!command) {
      console.warn(`[Interaction] Unknown slash command: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[Interaction] Error executing command ${interaction.commandName}:`, error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ There was an error executing this command!', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ There was an error executing this command!', ephemeral: true });
      }
    }
    return;
  }

  // 2. Handle Button Clicks
  if (interaction.isButton()) {
    const customId = interaction.customId;

    // A. Check Status Button
    if (customId.startsWith('status_btn:')) {
      const guildId = customId.split(':')[1];
      const userId = interaction.user.id;

      try {
        const timeout = await prisma.timeout.findFirst({
          where: { guildId, userId, active: true, timeoutEnd: { gt: new Date() } },
        });

        if (!timeout) {
          await interaction.reply({
            content: '✅ You currently have no active timeouts in this server.',
            ephemeral: true,
          });
          return;
        }

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        const guildName = guild ? guild.name : 'Unknown Server';

        const payload = DMService.buildStatusDM(guildName, guildId, timeout.timeoutEnd.getTime());
        await interaction.reply({ ...payload, ephemeral: true });
      } catch (error) {
        console.error('Error handling status button click:', error);
        await interaction.reply({ content: '❌ Error fetching status.', ephemeral: true });
      }
    }

    // B. Start Appeal Button (opens modal)
    else if (customId.startsWith('appeal_btn:') || customId.startsWith('start_appeal_btn:')) {
      const guildId = customId.split(':')[1];
      await AppealService.showAppealModal(interaction, guildId);
    }

    // C. Mod Action Buttons (Approve / Reject)
    else if (customId.startsWith('unmute_member:') || customId.startsWith('reject_appeal:')) {
      await AppealService.handleModAction(interaction, client);
    }
    return;
  }

  // 3. Handle Modal Submissions
  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;

    if (customId.startsWith('appeal_modal:')) {
      await AppealService.handleAppealSubmit(interaction, client);
    }
    return;
  }
}
