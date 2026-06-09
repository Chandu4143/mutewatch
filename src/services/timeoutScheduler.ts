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
}
