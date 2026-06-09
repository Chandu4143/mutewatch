import { GuildMember, Events } from 'discord.js';
import { prisma } from '../db.js';
import { DMService } from '../services/dmService.js';

export const name = Events.GuildMemberUpdate;

export async function execute(oldMember: GuildMember, newMember: GuildMember) {
  const oldTimestamp = oldMember.communicationDisabledUntilTimestamp;
  const newTimestamp = newMember.communicationDisabledUntilTimestamp;

  const wasTimedOut = oldTimestamp && oldTimestamp > Date.now();
  const isTimedOut = newTimestamp && newTimestamp > Date.now();

  // Case 1: Timeout applied or updated
  if (isTimedOut && (!wasTimedOut || oldTimestamp !== newTimestamp)) {
    const guildId = newMember.guild.id;
    const userId = newMember.id;
    const endAt = newMember.communicationDisabledUntil!;

    console.log(`[Timeout Detected] User ${newMember.user.tag} in ${newMember.guild.name} has been timed out until ${endAt.toISOString()}`);

    try {
      // 1. Deactivate any previous active timeouts for this user in this guild
      await prisma.timeout.updateMany({
        where: { guildId, userId, active: true },
        data: { active: false },
      });

      // 2. Create the new active timeout record
      await prisma.timeout.create({
        data: {
          guildId,
          userId,
          timeoutStart: new Date(),
          timeoutEnd: endAt,
          active: true,
        },
      });

      // 3. Send DM to the user
      const dmPayload = DMService.buildTimeoutDM(
        newMember.guild.name,
        guildId,
        endAt.getTime()
      );

      await newMember.send(dmPayload).catch(err => {
        console.log(`[Timeout Detected] Could not send DM to ${newMember.user.tag} (${userId}): DMs likely closed.`);
      });
    } catch (error) {
      console.error('[Timeout Detected] Error saving timeout to database:', error);
    }
  }

  // Case 2: Timeout removed early (unmuted by moderator before natural expiry)
  else if (!isTimedOut && wasTimedOut) {
    const guildId = newMember.guild.id;
    const userId = newMember.id;

    console.log(`[Timeout Removed] User ${newMember.user.tag} in ${newMember.guild.name} was unmuted early.`);

    try {
      // 1. Check if there was an active timeout tracked in the DB
      const activeTimeout = await prisma.timeout.findFirst({
        where: { guildId, userId, active: true },
      });

      if (!activeTimeout) {
        // If we didn't track it as active, no need to trigger removal notification
        return;
      }

      // 2. Mark active = false in DB
      await prisma.timeout.update({
        where: { id: activeTimeout.id },
        data: { active: false },
      });

      // 3. Send early unmute notification
      const dmPayload = DMService.buildExpirationDM(newMember.guild.name, true);
      await newMember.send(dmPayload).catch(err => {
        console.log(`[Timeout Removed] Could not send DM to ${newMember.user.tag} (${userId}): DMs likely closed.`);
      });
    } catch (error) {
      console.error('[Timeout Removed] Error marking timeout inactive in DB:', error);
    }
  }
}
