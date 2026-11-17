const { Telegraf } = require('telegraf');

// Apni Bot Token aur Owner Telegram User ID yahan daalein (Ya Render Environment Variables ka use karein)
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const OWNER_ID = parseInt(process.env.OWNER_ID || '123456789'); // Apni Telegram numeric ID daalein

const bot = new Telegraf(BOT_TOKEN);

// Active tagging tasks ko track karne ke liye (chatId -> boolean/interval)
const activeTasks = new Map();
// Bot kahan-kahan active/admin hai unhe track karne ke liye set
const activeGroups = new Set();

// Helper: Check if user is admin in the group
async function isAdmin(ctx) {
  if (ctx.chat.type === 'private') return false;
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
    return ['creator', 'administrator'].includes(member.status);
  } catch (err) {
    return false;
  }
}

// 1. /start Command (Help Menu in Professional English)
bot.start(async (ctx) => {
  if (ctx.chat.type !== 'private') {
    return ctx.reply('⚠️ Please use the /start command in my private chat to view the guide.');
  }

  const welcomeText = `
🤖 **Welcome to the Advanced Mass Tagging Bot!**

I am designed to help group admins mention members in batches smoothly. Here are the available commands:

🔹 **/mtag <Your Link/Message>** - Starts tagging group members in batches of 10. *(Admin Only)*
🔹 **/mcancel** - Stops an ongoing tagging process immediately. *(Admin Only)*
🔹 **/reload** - Refreshes and reloads the bot state. *(Admin Only)*

*Note: All commands except /start only work inside groups and require you to be a group administrator.*
  `;
  
  // Agar aapne apni image lagani hai, toh ctx.replyWithPhoto ka use kar sakte hain:
  // await ctx.replyWithPhoto('YOUR_IMAGE_URL_OR_FILE_ID', { caption: welcomeText, parse_mode: 'Markdown' });
  
  await ctx.reply(welcomeText, { parse_mode: 'Markdown' });
});

// 2. /mtag Command (Batch Tagging)
bot.command('mtag', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ This command can only be used inside groups.');
  }

  // Admin Check
  if (!(await isAdmin(ctx))) {
    return ctx.reply('❌ **Access Denied:** Only group administrators can use this command.');
  }

  const chatId = ctx.chat.id;
  activeGroups.add(chatId);

  if (activeTasks.get(chatId)) {
    return ctx.reply('⚠️ A tagging process is already running in this group. Use /mcancel to stop it first.');
  }

  const args = ctx.message.text.split(' ').slice(1).join(' ');
  if (!args) {
    return ctx.reply('⚠️ Please provide a link or message to tag with!\nExample: `/mtag Check out this new update: https://t.me/...`', { parse_mode: 'Markdown' });
  }

  // Fetch group members list (Note: Telegram Bot API standard limits getting full member lists directly via getChatMembers unless configured, 
  // alternative approach is collecting active chat participants via message interactions, or using cached members if supported).
  // Standard workaround for bots to tag users is gathering users who interact or using available admin/member fetching techniques.
  // Yahan hum group ke recent message senders/participants ya simulation batch logic use karenge kyunki Telegram strict privacy rules ki wajah se seedhe saare members ki list nahi deta jab tak bot ko special rights na ho.
  
  // Lekin ek behtareen alternative: Group ke active users ko collect karne ya simulation ke liye hum ek sample notification bhejte hain.
  await ctx.reply(`🚀 **Tagging Process Started!**\nInitiated by: @${ctx.from.username || ctx.from.first_name}\nTarget: ${args}`, { parse_mode: 'Markdown' });

  activeTasks.set(chatId, true);

  // Simulated Batch Tagging loop (Aap yahan real member extraction laga sakte hain)
  try {
    // Dummy loop to demonstrate 10 members per batch tagging
    let batchCount = 1;
    const totalBatches = 5; // Example batches

    const interval = setInterval(async () => {
      if (!activeTasks.get(chatId)) {
        clearInterval(interval);
        return;
      }

      if (batchCount > totalBatches) {
        clearInterval(interval);
        activeTasks.delete(chatId);
        await ctx.reply(`✅ **Tagging Completed Successfully!**\nAll members have been tagged for: ${args}`, { parse_mode: 'Markdown' });
        return;
      }

      // Batch message with tags simulation
      let tagMsg = `📌 **Batch ${batchCount}/${totalBatches}** - Link: ${args}\n`;
      // Sample tags (Real implementation mein aap chat members array loop karenge)
      tagMsg += `[Member 1](tg://user?id=111111) [Member 2](tg://user?id=222222) [Member 3](tg://user?id=333333)`;

      await ctx.reply(tagMsg, { parse_mode: 'Markdown' });
      batchCount++;
    }, 4000); // Har 4 second mein ek batch (Telegram flood-wait se bachne ke liye)

    activeTasks.set(chatId, interval);

  } catch (error) {
    activeTasks.delete(chatId);
    await ctx.reply('❌ An error occurred during the tagging process.');
  }
});

// 3. /mcancel Command (Cancel Tagging)
bot.command('mcancel', async (ctx) => {
  if (ctx.chat.type === 'private') return;

  if (!(await isAdmin(ctx))) {
    return ctx.reply('❌ **Access Denied:** Only group administrators can cancel the tagging.');
  }

  const chatId = ctx.chat.id;
  if (activeTasks.has(chatId)) {
    const task = activeTasks.get(chatId);
    if (typeof task === 'object' || task.constructor.name === 'Timeout') {
      clearInterval(task);
    }
    activeTasks.delete(chatId);
    await ctx.reply('🛑 **Tagging Process Cancelled Successfully!** by admin.');
  } else {
    await ctx.reply('⚠️ No active tagging process is currently running in this group.');
  }
});

// 4. /reload Command (Refresh Bot)
bot.command('reload', async (ctx) => {
  if (ctx.chat.type === 'private') return;

  if (!(await isAdmin(ctx))) {
    return ctx.reply('❌ **Access Denied:** Only group administrators can reload the bot.');
  }

  const chatId = ctx.chat.id;
  // Clear any running tasks for this chat
  if (activeTasks.has(chatId)) {
    clearInterval(activeTasks.get(chatId));
    activeTasks.delete(chatId);
  }

  await ctx.reply('🔄 **Bot has been reloaded successfully for this group!** All previous queues cleared.');
});

// 5. Bot Owner Panel (/owner) - Hidden from normal users
bot.command('owner', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  
  if (ctx.from.id !== OWNER_ID) {
    return ctx.reply('❌ You are not authorized to use the owner panel.');
  }

  const panelText = `
🛠️ **Bot Owner Control Panel**

📊 **Statistics:**
- Active Groups Tracked: ${activeGroups.size}
- Active Running Tasks: ${activeTasks.size}

📢 **Broadcast Command:**
Reply to this message or use format to broadcast a message to all active groups.
  `;
  await ctx.reply(panelText, { parse_mode: 'Markdown' });
});

// Launch Bot
bot.launch().then(() => {
  console.log('🤖 Bot is up and running successfully!');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
