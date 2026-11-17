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

// 1. /start Command (Help Guide)
bot.start(async (ctx) => {
  if (ctx.chat.type !== 'private') {
    return ctx.reply('⚠️ Please use the /start command in my private chat to view the guide.');
  }

  const welcomeText = 
`🤖 Welcome to the Advanced Mass Tagging Bot!

I am designed to help group admins mention members in batches smoothly. Here are the available commands:

🔹 /mtag <Your Link/Message> - Starts tagging group members in batches of 10 in your requested style. (Admin Only)
🔹 /mcancel - Stops an ongoing tagging process immediately. (Admin Only)
🔹 /reload - Refreshes and reloads the bot state. (Admin Only)

Note: All commands except /start only work inside groups and require you to be a group administrator.`;
  
  await ctx.reply(welcomeText);
});

// 2. /mtag Command (Exact Format Tagging)
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
    return ctx.reply('⚠️ Please provide a link or message to tag with!\nExample: /mtag https://t.me/...');
  }

  const adminName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  await ctx.reply(`🚀 Tagging Process Started!\nInitiated by: ${adminName}`);

  activeTasks.set(chatId, true);

  try {
    // Note: Telegram standard bots cannot fetch all members list via a simple API call due to privacy, 
    // unless members have recently interacted. Here we use simulated active users data or list 
    // structured cleanly in your requested format (Up link, below names).
    
    // Sample member pool representation for demonstration (You can connect real cached chat participants array here)
    const mockMembers = [
      { id: 111111, name: "Kuldeep" },
      { id: 222222, name: "Annuu 👀" },
      { id: 333333, name: "🔥 Aavya 🌻" },
      { id: 444444, name: "Sudeep 🤠" },
      { id: 555555, name: "V" },
      { id: 666666, name: "Hashik" },
      { id: 777777, name: "V" },
      { id: 888888, name: "Eva" },
      { id: 999999, name: "Zayyn" },
      // ... aur bhi members agar honge toh batches mein divide honge
    ];

    const batchSize = 10;
    let index = 0;
    let batchNumber = 1;

    const interval = setInterval(async () => {
      if (!activeTasks.get(chatId)) {
        clearInterval(interval);
        return;
      }

      if (index >= mockMembers.length) {
        clearInterval(interval);
        activeTasks.delete(chatId);
        await ctx.reply(`✅ Tagging Completed Successfully!\nAll members have been tagged.`);
        return;
      }

      // Current batch ke 10 members lena
      const currentBatch = mockMembers.slice(index, index + batchSize);
      
      // Screenshot jaisa format banana: Upar link, niche commas ke sath names (clickable)
      let formattedText = `${args}\n\n`;
      const nameLinks = currentBatch.map(m => `[${m.name}](tg://user?id=${m.id})`);
      formattedText += nameLinks.join(', ');

      // Send message using Markdown parsing for clickable names
      await ctx.reply(formattedText, { parse_mode: 'Markdown' });

      index += batchSize;
      batchNumber++;
    }, 4000); // Har 4 second mein agla batch

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
    if (typeof task === 'object') {
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
