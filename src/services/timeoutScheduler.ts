import { Client } from 'discord.js';
import { prisma } from '../db.js';
import { DMService } from './dmService.js';

export class TimeoutScheduler {
  private static interval: NodeJS.Timeout | null = null;

  /**
   * Starts the background scheduler for tracking natural timeout expirations
   */
  static start(client: Client) {
    if (this.interval) {
      clearInterval(this.interval);
    }

    console.log('[TimeoutScheduler] Starting natural expiration background worker...');

    // Run every 30 seconds
    this.interval = setInterval(async () => {
      try {
        const now = new Date();

        // Find active timeouts in the DB that have ended
        const expiredTimeouts = await prisma.timeout.findMany({
          where: {
            active: true,
            timeoutEnd: { lte: now },
          },
        });

        if (expiredTimeouts.length === 0) return;

        console.log(`[TimeoutScheduler] Found ${expiredTimeouts.length} expired timeouts to process.`);

        for (const timeout of expiredTimeouts) {
          try {
            // 1. Mark as inactive in the DB immediately to prevent double processing
            await prisma.timeout.update({
              where: { id: timeout.id },
              data: { active: false },
            });

            // 2. Fetch the user and guild details to send DM
            const user = await client.users.fetch(timeout.userId).catch(() => null);
            if (!user) {
              console.log(`[TimeoutScheduler] Could not fetch user ${timeout.userId} for expiration notification.`);
              continue;
            }

            const guild = await client.guilds.fetch(timeout.guildId).catch(() => null);
            const guildName = guild ? guild.name : 'Unknown Server';

            // 3. Send DM notification
            const dmPayload = DMService.buildExpirationDM(guildName);
            await user.send(dmPayload).catch(err => {
              console.log(`[TimeoutScheduler] Failed to send expiration DM to ${user.tag} (${user.id}): DMs likely closed.`);
            });

            console.log(`[TimeoutScheduler] Processed expiration notification for ${user.tag} in ${guildName}.`);
          } catch (error) {
            console.error(`[TimeoutScheduler] Error processing timeout ID ${timeout.id}:`, error);
          }
        }
      } catch (error) {
        console.error('[TimeoutScheduler] Error querying expired timeouts:', error);
      }
    }, 30000); // 30 seconds
  }

  /**
   * Stops the background scheduler
   */
  static stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[TimeoutScheduler] Expiration background worker stopped.');
    }
  }

  /**
   * Syncs the database state with the actual Discord API state for a specific user
   * across all guilds the bot shares with them.
   */
  static async syncUserActiveTimeouts(client: Client, userId: string): Promise<void> {
    try {
      // Loop through all guilds in the cache
      for (const [guildId, guild] of client.guilds.cache) {
        try {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (!member) continue;

          const isTimedOut = member.communicationDisabledUntilTimestamp && member.communicationDisabledUntilTimestamp > Date.now();

          // Check if we have an active timeout in the database for this guild/user
          const activeTimeout = await prisma.timeout.findFirst({
            where: {
              guildId,
              userId,
              active: true,
              timeoutEnd: { gt: new Date() },
            },
          });

          if (isTimedOut) {
            const endAt = member.communicationDisabledUntil!;
            
            if (!activeTimeout) {
              console.log(`[Sync] Found untracked active timeout for ${member.user.tag} in ${guild.name}. Syncing to DB.`);
              // Deactivate any old active ones first just in case
              await prisma.timeout.updateMany({
                where: { guildId, userId, active: true },
                data: { active: false },
              });

              // Create new active timeout
              await prisma.timeout.create({
                data: {
                  guildId,
                  userId,
                  timeoutStart: new Date(),
                  timeoutEnd: endAt,
                  active: true,
                },
              });
            } else if (activeTimeout.timeoutEnd.getTime() !== endAt.getTime()) {
              console.log(`[Sync] Timeout duration changed for ${member.user.tag} in ${guild.name}. Updating DB.`);
              await prisma.timeout.update({
                where: { id: activeTimeout.id },
                data: { timeoutEnd: endAt },
              });
            }
          } else {
            // Member is not timed out, but DB has an active timeout
            if (activeTimeout) {
              console.log(`[Sync] Active timeout found in DB but user ${member.user.tag} is not timed out in ${guild.name}. Deactivating in DB.`);
              await prisma.timeout.update({
                where: { id: activeTimeout.id },
                data: { active: false },
              });
            }
          }
        } catch (innerError) {
          console.error(`[Sync] Error syncing user ${userId} in guild ${guildId}:`, innerError);
        }
      }
    } catch (error) {
      console.error(`[Sync] Error syncing active timeouts for user ${userId}:`, error);
    }
  }
}
