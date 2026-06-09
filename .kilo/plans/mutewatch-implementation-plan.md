# Implementation Plan: MuteWatch

This document outlines the architecture, database schema, and step-by-step implementation plan for **MuteWatch**, a Discord bot designed to keep timed-out users informed about their status, expiration times, and appeals.

---

## 1. Technology Stack

* **Language:** TypeScript
* **Runtime:** Node.js (v18+)
* **Library:** Discord.js (v14)
* **Database:** SQLite (excellent for local storage, lightweight, and easy to package/deploy)
* **ORM:** Prisma (allows easy transition to PostgreSQL in production if needed)
* **Scheduler:** Node-cron or simple `setInterval` (for tracking passive timeout expirations)

---

## 2. Discord Bot Configuration & Intents

The bot requires the following **Gateway Intents** to function correctly:
* `Guilds`: To manage server configurations and fetch channels.
* `GuildMembers` (Privileged): To listen to `guildMemberUpdate` events for timeout detection.
* `DirectMessages`: To receive DM commands and button clicks from users.
* `DirectMessageReactions`: Optional, but useful.
* `MessageContent` (Privileged): To support message-based DM commands (e.g., typing `status` or `appeal` directly in DMs).

---

## 3. Database Schema (Prisma)

We will use Prisma with SQLite for simplicity, speed, and reliability.

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// Store configuration for each guild
model GuildSettings {
  guildId         String   @id @map("guild_id")
  appealChannelId String?  @map("appeal_channel_id")
  createdAt       DateTime @default(now()) @map("created_at")

  @@map("guild_settings")
}

// Track timeout history and active status
model Timeout {
  id           Int      @id @default(autoincrement())
  guildId      String   @map("guild_id")
  userId       String   @map("user_id")
  timeoutStart DateTime @map("timeout_start")
  timeoutEnd   DateTime @map("timeout_end")
  active       Boolean  @default(true)
  createdAt    DateTime @default(now()) @map("created_at")

  @@map("timeouts")
}

// Track appeals submitted by users
model Appeal {
  id        Int      @id @default(autoincrement())
  guildId   String   @map("guild_id")
  userId    String   @map("user_id")
  message   String
  status    String   @default("PENDING") // PENDING, APPROVED, REJECTED
  createdAt DateTime @default(now()) @map("created_at")

  @@map("appeals")
}
```

---

## 4. Key Architectural Components

### A. Event Handlers
1. **`ready`**: Initializes the bot, registers global/guild slash commands, and starts the background expiration scheduler.
2. **`guildMemberUpdate`**: Listens for timeout additions, modifications, and removals.
3. **`interactionCreate`**: Handles Slash Commands, Button Clicks (Status/Appeal), and Modal Submissions (Appeal Form).
4. **`messageCreate`**: Parses text-based commands in DM channels (fallback/supplement to slash commands).

### B. Core Services
1. **`TimeoutScheduler`**: Runs a background check every 30-60 seconds to find active timeouts that have naturally expired (`timeoutEnd <= now`). It sends expiration DMs to users and marks records as inactive.
2. **`DMService`**: Standardizes and builds rich interactive Embeds for DMs (Timeout Notifications, Status Checks, Expiration Alerts) with action buttons.
3. **`AppealService`**: Manages the modal submission workflow, DB tracking of appeals, and forwarding formatted appeal reports to the designated moderator channel.

---

## 5. Detailed Feature Workflows

### Feature 1: Timeout Detection (`guildMemberUpdate`)
* **Trigger:** Compare `oldMember.communicationDisabledUntil` with `newMember.communicationDisabledUntil`.
* **State 1: Timeout Applied/Updated:**
  * If `newMember.communicationDisabledUntil` is a future timestamp:
    * Save/update the `Timeout` record in the database (`active: true`).
    * Fetch or create user-friendly duration details.
    * Send an immediate DM with the timeout end time, remaining duration, and buttons: `[ Check Status ]` and `[ Appeal ]`.
* **State 2: Timeout Removed Early:**
  * If `newMember.communicationDisabledUntil` is null but `oldMember.communicationDisabledUntil` was in the future:
    * Update database record (`active: false`).
    * Send DM notifying the user that their timeout has been removed early.

### Feature 2: Active Timeout Expiration (`TimeoutScheduler`)
* Discord does not emit an event when a timeout naturally expires.
* **Polling Logic:**
  * Every 30 seconds, query the database for timeouts where `active = true` and `timeoutEnd <= now`.
  * For each expired timeout:
    * Set `active = false` in the database.
    * Send a DM: `Your timeout in [Guild Name] has expired. You can now participate in the server again.`
    * Gracefully handle errors (e.g., if the user blocked the bot or closed DMs).

### Feature 3: DM Commands & Buttons (Status Check)
* Users can click the `[ Check Status ]` button, run `/status` in DMs, or type `status` in DMs.
* **Resolution Logic:**
  1. Look up active timeouts for the user in the database.
  2. If none exist: Inform the user they have no active timeouts.
  3. If exactly one exists: Display a detailed status card with remaining time, guild name, and appeal button.
  4. If multiple exist: Present a Selection Menu or buttons to choose which guild they are inquiring about.

### Feature 4: Appeal Submission Workflow
* **Trigger:** Click `[ Appeal ]` button (which contains the encoded guild ID, e.g., `appeal_btn:<guildId>`), run `/appeal` in DMs, or type `appeal` in DMs.
* **Interactive Form:**
  * Show a Discord **Modal** with:
    * Title: "Submit Timeout Appeal"
    * Text Input (Paragraph): "Why should your timeout be reconsidered?"
* **Submission Handling:**
  1. Save the appeal text to the `Appeal` table.
  2. Retrieve the `GuildSettings` for the guild.
  3. If no appeal channel is configured: Inform the user that the server has not enabled appeals.
  4. If configured: Format and send a rich Embed to the moderator channel with:
     * User profile details (Mention, Username, ID).
     * Appeal message content.
     * Shortcut button to unmute the user (requires appropriate moderator permissions).

---

## 6. Implementation Milestones

### Phase 1: Project Setup & Database Configuration
- [ ] Create `package.json`, `tsconfig.json`, and set up TypeScript scripts.
- [ ] Install dependencies: `discord.js`, `@prisma/client`, `prisma`, `dotenv`.
- [ ] Initialize Prisma and configure the SQLite database schema.
- [ ] Create `.env.example` file with placeholder variables.

### Phase 2: Bot Core & Server Commands
- [ ] Implement bot initialization (`src/index.ts` and `src/config.ts`).
- [ ] Implement command loader & register slash commands:
  - `/setup` (Admin-only: Configure appeal channel)
  - `/settings` (Admin-only: View current appeal channel)
  - `/testdm` (Admin-only: Test DM delivery)
- [ ] Implement event listeners for `ready` and `interactionCreate` (command execution).

### Phase 3: Timeout Detection & Active Polling Scheduler
- [ ] Build the `guildMemberUpdate` event listener to track timeouts.
- [ ] Implement DB persistence for detected timeouts.
- [ ] Implement the `TimeoutScheduler` background worker to handle natural timeout expirations.
- [ ] Implement robust error handling for blocked DMs.

### Phase 4: User Notifications & Status Command
- [ ] Implement `DMService` to generate uniform and beautiful Embeds/Buttons.
- [ ] Implement `/status` command and button interaction.
- [ ] Implement text-based DM message parsing in `messageCreate` for offline command support.

### Phase 5: Appeal System
- [ ] Implement the Appeal modal popup on button click.
- [ ] Implement modal submit interaction handler.
- [ ] Save appeal to database and forward formatted message to the configured moderation channel.

---

## 7. Testing & Quality Assurance Plan

1. **Local Setup Verification:** Confirm all npm packages install cleanly and types compile perfectly (`npm run build`).
2. **Database Migrations:** Verify that Prisma migration runs successfully and creates the SQLite database.
3. **Manual Testing Loop:**
   - Add bot to a test Discord guild.
   - Use a secondary account to test timeouts.
   - Verify immediate DM on timeout.
   - Verify background scheduler triggers on timeout expiration.
   - Verify modal submission and delivery to the moderation channel.
   - Verify `/setup` and `/settings` commands work with correct permissions.
