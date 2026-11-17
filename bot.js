const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const OWNER_ID = parseInt(process.env.OWNER_ID || '123456789');

const bot = new Telegraf(BOT_TOKEN);

const activeTasks = new Map();
const activeGroups = new Set();
const groupMembers = new Map(); // chatId -> Map(userId -> name)
const userLastMessage = new Map(); // Spam detection ke liye
const lastBotWelcomeMsg = new Map(); // Purana welcome message delete karne ke liye

// Helper: Check if user is admin
async function isAdmin(ctx) {
  if (ctx.chat.type === 'private') return false;
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
    return ['creator', 'administrator'].includes(member.status);
  } catch (err) {
    return false;
  }
}

// Group ke har message par members collect karna aur security check lagana
bot.on('message', async (ctx, next) => {
  if (!ctx.chat || ctx.chat.type === 'private') return next();

  const chatId = ctx.chat.id;
  activeGroups.add(chatId);

  // Bot ko group me add kiye jane par welcome message
  if (ctx.message.new_chat_members) {
    const botInfo = await bot.telegram.getMe();
    const isBotAdded = ctx.message.new_chat_members.some(m => m.id === botInfo.id);

    if (isBotAdded) {
      if (lastBotWelcomeMsg.has(chatId)) {
        try {
          await ctx.telegram.deleteMessage(chatId, lastBotWelcomeMsg.get(chatId));
        } catch (e) {}
      }

      const welcomeGroupMsg = await ctx.reply(
`┏ { 🤖 **Utag Pro & Security** }
┃
┣ 🛡️ **Status:** Active & Ready
┣ 🟢 **START:** \`/tagall\` or \`/run\`
┗ 🔴 **STOP :** \`/stop\``, 
        { parse_mode: 'Markdown' }
      );
      
      lastBotWelcomeMsg.set(chatId, welcomeGroupMsg.message_id);
      return;
    }
  }

  if (ctx.from) {
    if (!groupMembers.has(chatId)) {
      groupMembers.set(chatId, new Map());
    }
    const membersMap = groupMembers.get(chatId);
    const name = ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : '');
    membersMap.set(ctx.from.id, { id: ctx.from.id, name: name });
  }

  // Agar user admin hai toh security rules skip honge
  if (await isAdmin(ctx)) return next();

  const userId = ctx.from.id;
  const messageText = ctx.message.text || ctx.message.caption || '';
  const urlRegex = /(https?:\/\/[^\s]+)|(t\.me\/[^\s]+)|(www\.[^\s]+)/gi;

  // 1. Link Detection (Mute)
  if (urlRegex.test(messageText)) {
    try {
      await ctx.deleteMessage();
      await ctx.restrictChatMember(userId, { permissions: { can_send_messages: false } });
      await ctx.reply(`⚠️ @${ctx.from.username || ctx.from.first_name} has been **Muted** for sending links!`, { parse_mode: 'Markdown' });
    } catch (e) {}
    return;
  }

  // 2. Forward Message Protection (Mute)
  if (ctx.message.forward_date || ctx.message.forward_from || ctx.message.forward_from_chat) {
    try {
      await ctx.deleteMessage();
      await ctx.restrictChatMember(userId, { permissions: { can_send_messages: false } });
      await ctx.reply(`⚠️ @${ctx.from.username || ctx.from.first_name} has been **Muted** for forwarding messages!`, { parse_mode: 'Markdown' });
    } catch (e) {}
    return;
  }

  // 3. Bio-Link Protection (Ban)
  try {
    const chatMember = await ctx.telegram.getChat(userId);
    const bio = chatMember.bio || '';
    if (urlRegex.test(bio)) {
      await ctx.deleteMessage();
      await ctx.banChatMember(userId);
      await ctx.reply(`🚫 @${ctx.from.username || ctx.from.first_name} has been **Banned** because their Bio contains a promotional link!`, { parse_mode: 'Markdown' });
      return;
    }
  } catch (e) {}

  // 4. Anti-Spam (Ban)
  const currentTime = Date.now();
  if (userLastMessage.has(userId)) {
    const lastData = userLastMessage.get(userId);
    if (lastData.text === messageText && (currentTime - lastData.time < 4000)) {
      try {
        await ctx.deleteMessage();
        await ctx.banChatMember(userId);
        await ctx.reply(`🚫 @${ctx.from.username || ctx.from.first_name} has been **Banned** for Spamming!`, { parse_mode: 'Markdown' });
      } catch (e) {}
      return;
    }
  }
  userLastMessage.set(userId, { text: messageText, time: currentTime });

  return next();
});

// 1. /start Command (Personal Chat Style)
bot.start(async (ctx) => {
  if (ctx.chat.type !== 'private') return;

  const userName = ctx.from.first_name || 'User';
  
  const welcomeText = 
`┏ { 🤖 **Utag Pro** }
┃
┣ 👏 **Hi: ${userName}** 🍃
┣ ⚡ **Engine: Own**
┃
┣ 🟢 **START:** \`/tagall\` or \`/run\`
┗ 🔴 **STOP :** \`/stop\`

—— **REPLY TO START** ——`;

  await ctx.reply(welcomeText, { parse_mode: 'Markdown' });
});

// 2. /tagall or /run Command (Batch Tagging with Screenshot Format)
const handleTagStart = async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ This command can only be used inside groups.');
  }

  if (!(await isAdmin(ctx))) {
    return ctx.reply('❌ Access Denied: Only group administrators can use this command.');
  }

  const chatId = ctx.chat.id;
  activeGroups.add(chatId);

  if (activeTasks.get(chatId)) {
    return ctx.reply('⚠️ Tagging is already running. Use /stop to cancel.');
  }

  const args = ctx.message.text.split(' ').slice(1).join(' ');
  if (!args) {
    return ctx.reply('⚠️ Please provide a message or link!\nExample: `/tagall https://t.me/...`', { parse_mode: 'Markdown' });
  }

  const membersMap = groupMembers.get(chatId);
  if (!membersMap || membersMap.size === 0) {
    return ctx.reply('⚠️ No members found in cache yet! Let some members chat first so I can detect them.');
  }

  const membersList = Array.from(membersMap.values());
  const adminName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  
  await ctx.reply(`🚀 **Tagging Process Started!**\nInitiated by: ${adminName}`, { parse_mode: 'Markdown' });

  activeTasks.set(chatId, true);

  try {
    const batchSize = 10;
    let index = 0;

    const interval = setInterval(async () => {
      if (!activeTasks.get(chatId)) {
        clearInterval(interval);
        return;
      }

      if (index >= membersList.length) {
        clearInterval(interval);
        activeTasks.delete(chatId);
        await ctx.reply(`✅ **Tagging Completed Successfully!** All members have been tagged.`);
        return;
      }

      const currentBatch = membersList.slice(index, index + batchSize);
      
      // Screenshot format: Upar link/message, niche commas ke sath clickable names
      let formattedText = `${args}\n\n`;
      const nameLinks = currentBatch.map(m => `[${m.name}](tg://user?id=${m.id})`);
      formattedText += nameLinks.join(', ');

      await ctx.reply(formattedText, { parse_mode: 'Markdown' });

      index += batchSize;
    }, 4000); // 4 seconds gap

    activeTasks.set(chatId, interval);

  } catch (error) {
    activeTasks.delete(chatId);
    await ctx.reply('❌ An error occurred during tagging.');
  }
};

bot.command('tagall', handleTagStart);
bot.command('run', handleTagStart);

// 3. /stop Command
bot.command('stop', async (ctx) => {
  if (ctx.chat.type === 'private') return;
  if (!(await isAdmin(ctx))) return ctx.reply('❌ Admin only.');

  const chatId = ctx.chat.id;
  if (activeTasks.has(chatId)) {
    const task = activeTasks.get(chatId);
    if (typeof task === 'object' || typeof task === 'number') {
      clearInterval(task);
    }
    activeTasks.delete(chatId);
    await ctx.reply('🛑 **Tagging Process Stopped Successfully!**');
  } else {
    await ctx.reply('⚠️ No active tagging process is currently running in this group.');
  }
});

// 4. Owner Panel (/owner) with 2 Advanced Buttons
bot.command('owner', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  if (ctx.from.id !== OWNER_ID) return ctx.reply('❌ Unauthorized Access.');

  const ownerText = 
`🛠️ **Bot Owner Control Panel**

📊 **Statistics:**
- Active Groups Tracked: ${activeGroups.size}
- Active Running Tasks: ${activeTasks.size}

Select an option below:`;

  await ctx.reply(ownerText, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📊 Active Groups', callback_data: 'owner_groups' },
          { text: '📢 Broadcast', callback_data: 'owner_broadcast_prompt' }
        ]
      ]
    }
  });
});

bot.action('owner_groups', async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return ctx.answerCbQuery('❌ Unauthorized.');
  await ctx.answerCbQuery();
  await ctx.reply(`📋 **Total Active Groups:** ${activeGroups.size}\nAll active group sessions are running securely.`);
});

bot.action('owner_broadcast_prompt', async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return ctx.answerCbQuery('❌ Unauthorized.');
  await ctx.answerCbQuery();
  await ctx.reply(`📢 **Broadcast Guide:**\nSend your broadcast message using this format:\n\`/broadcast Your Message Here\``, { parse_mode: 'Markdown' });
});

// Broadcast Command for Owner
bot.command('broadcast', async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;

  const broadcastMsg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!broadcastMsg) {
    return ctx.reply('⚠️ Please provide a message to broadcast!\nExample: `/broadcast Hello everyone!`');
  }

  let successCount = 0;
  let failCount = 0;

  await ctx.reply(`🚀 Broadcasting message to ${activeGroups.size} groups...`);

  for (const chatId of activeGroups) {
    try {
      await bot.telegram.sendMessage(chatId, `📢 **Owner Broadcast:**\n\n${broadcastMsg}`, { parse_mode: 'Markdown' });
      successCount++;
    } catch (err) {
      failCount++;
    }
  }

  await ctx.reply(`✅ **Broadcast Completed!**\n- Success: ${successCount}\n- Failed: ${failCount}`);
});

bot.launch().then(() => {
  console.log('🤖 Utag Pro Tagger & Protection Bot is running successfully!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
