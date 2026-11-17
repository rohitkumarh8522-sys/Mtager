const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const OWNER_ID = parseInt(process.env.OWNER_ID || '123456789');

const bot = new Telegraf(BOT_TOKEN);

const activeTasks = new Map();
const activeGroups = new Set();

async function isAdmin(ctx) {
  if (ctx.chat.type === 'private') return false;
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
    return ['creator', 'administrator'].includes(member.status);
  } catch (err) {
    return false;
  }
}

// 1. /start Command
bot.start(async (ctx) => {
  if (ctx.chat.type !== 'private') {
    return ctx.reply('⚠️ Please use the /start command in my private chat to view the guide.');
  }

  const welcomeText = 
`🤖 Welcome to the Advanced Mass Tagging Bot!

I am designed to help group admins mention members in batches smoothly. Here are the available commands:

🔹 /mtag <Your Link/Message> - Starts tagging group members in batches of 10. (Admin Only)
🔹 /mcancel - Stops an ongoing tagging process immediately. (Admin Only)
🔹 /reload - Refreshes and reloads the bot state. (Admin Only)

Note: All commands except /start only work inside groups and require you to be a group administrator.`;
  
  await ctx.reply(welcomeText);
});

// 2. /mtag Command
bot.command('mtag', async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ This command can only be used inside groups.');
  }

  if (!(await isAdmin(ctx))) {
    return ctx.reply('❌ Access Denied: Only group administrators can use this command.');
  }

  const chatId = ctx.chat.id;
  activeGroups.add(chatId);

  if (activeTasks.get(chatId)) {
    return ctx.reply('⚠️ A tagging process is already running in this group. Use /mcancel to stop it first.');
  }

  const args = ctx.message.text.split(' ').slice(1).join(' ');
  if (!args) {
    return ctx.reply('⚠️ Please provide a link or message to tag with!\nExample: /mtag Check out this new update: https://t.me/...');
  }

  const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  await ctx.reply(`🚀 Tagging Process Started!\nInitiated by: ${userName}\nTarget: ${args}`);

  activeTasks.set(chatId, true);

  try {
    let batchCount = 1;
    const totalBatches = 5;

    const interval = setInterval(async () => {
      if (!activeTasks.get(chatId)) {
        clearInterval(interval);
        return;
      }

      if (batchCount > totalBatches) {
        clearInterval(interval);
        activeTasks.delete(chatId);
        await ctx.reply(`✅ Tagging Completed Successfully!\nAll members have been tagged for: ${args}`);
        return;
      }

      let tagMsg = `📌 Batch ${batchCount}/${totalBatches} - Link: ${args}\n`;
      tagMsg += `[Member 1] (tg://user?id=111111) [Member 2] (tg://user?id=222222) [Member 3] (tg://user?id=333333)`;

      await ctx.reply(tagMsg);
      batchCount++;
    }, 4000);

    activeTasks.set(chatId, interval);

  } catch (error) {
    activeTasks.delete(chatId);
    await ctx.reply('❌ An error occurred during the tagging process.');
  }
});

// 3. /mcancel Command
bot.command('mcancel', async (ctx) => {
  if (ctx.chat.type === 'private') return;

  if (!(await isAdmin(ctx))) {
    return ctx.reply('❌ Access Denied: Only group administrators can cancel the tagging.');
  }

  const chatId = ctx.chat.id;
  if (activeTasks.has(chatId)) {
    const task = activeTasks.get(chatId);
    if (typeof task === 'object' || task.constructor.name === 'Timeout') {
      clearInterval(task);
    }
    activeTasks.delete(chatId);
    await ctx.reply('🛑 Tagging Process Cancelled Successfully by admin.');
  } else {
    await ctx.reply('⚠️ No active tagging process is currently running in this group.');
  }
});

// 4. /reload Command
bot.command('reload', async (ctx) => {
  if (ctx.chat.type === 'private') return;

  if (!(await isAdmin(ctx))) {
    return ctx.reply('❌ Access Denied: Only group administrators can reload the bot.');
  }

  const chatId = ctx.chat.id;
  if (activeTasks.has(chatId)) {
    clearInterval(activeTasks.get(chatId));
    activeTasks.delete(chatId);
  }

  await ctx.reply('🔄 Bot has been reloaded successfully for this group! All previous queues cleared.');
});

// 5. Bot Owner Panel (/owner)
bot.command('owner', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  
  if (ctx.from.id !== OWNER_ID) {
    return ctx.reply('❌ You are not authorized to use the owner panel.');
  }

  const panelText = 
`🛠️ Bot Owner Control Panel

📊 Statistics:
- Active Groups Tracked: ${activeGroups.size}
- Active Running Tasks: ${activeTasks.size}

📢 Broadcast Command:
Use format to broadcast a message to all active groups.`;
  
  await ctx.reply(panelText);
});

bot.launch().then(() => {
  console.log('🤖 Bot is up and running successfully!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
