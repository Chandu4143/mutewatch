import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('testdm')
  .setDescription('Test MuteWatch DM delivery')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  const user = interaction.user;

  try {
    await user.send({
      content: `🔔 **MuteWatch DM Delivery Test**\n\nThis is a test message from MuteWatch to confirm that I can send you direct messages. If you can read this, my DM delivery is working perfectly!`,
    });

    await interaction.reply({
      content: '✅ DM sent successfully! Check your direct messages.',
      ephemeral: true,
    });
  } catch (error) {
    console.error(`Failed to send test DM to ${user.tag}:`, error);
    await interaction.reply({
      content: '❌ Failed to send DM. Please ensure your direct messages are enabled for this server (Settings -> Privacy & Safety -> Allow direct messages from server members).',
      ephemeral: true,
    });
  }
}
