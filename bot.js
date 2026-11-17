const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const OWNER_ID = parseInt(process.env.OWNER_ID || '123456789');

const bot = new Telegraf(BOT_TOKEN);

const activeTasks = new Map();
const activeGroups = new Set();
const groupMembers = new Map(); // chatId -> Map(userId -> name)

async function isAdmin(ctx) {
  if (ctx.chat.type === 'private') return false;
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
    return ['creator', 'administrator'].includes(member.status);
  } catch (err) {
    return false;
  }
}

// ग्रुप के हर मैसेज पर मेंबर्स को कलेक्ट करना
bot.on('message', (ctx, next) => {
  if (ctx.chat && ctx.chat.type !== 'private' && ctx.from) {
    const chatId = ctx.chat.id;
    activeGroups.add(chatId); // ग्रुप ट्रैक करना
    if (!groupMembers.has(chatId)) {
      groupMembers.set(chatId, new Map());
    }
    const membersMap = groupMembers.get(chatId);
    const name = ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : '');
    membersMap.set(ctx.from.id, { id: ctx.from.id, name: name });
  }
  return next();
});

// 1. /start Command (आपके स्क्रीनशॉट वाला स्टाइलिश फॉर्मेट)[span_0](start_span)[span_0](end_span)
bot.start(async (ctx) => {
  if (ctx.chat.type !== 'private') {
    return ctx.reply('⚠️ Please use the /start command in my private chat.');
  }

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

// 2. /tagall या /run Command (Real Members Batch Tagging)
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
      
      // स्क्रीनशॉट वाला फॉर्मेट: ऊपर लिंक/मैसेज, नीचे कॉमा लगाकर सबके क्लिकेबल नाम[span_1](start_span)[span_1](end_span)
      let formattedText = `${args}\n\n`;
      const nameLinks = currentBatch.map(m => `[${m.name}](tg://user?id=${m.id})`);
      formattedText += nameLinks.join(', ');

      await ctx.reply(formattedText, { parse_mode: 'Markdown' });

      index += batchSize;
    }, 4000); // 4 सेकंड का गैप

    activeTasks.set(chatId, interval);

  } catch (error) {
    activeTasks.delete(chatId);
    await ctx.reply('❌ An error occurred during tagging.');
  }
};

bot.command('tagall', handleTagStart);
bot.command('run', handleTagStart);

// 3. /stop Command (Tagging रोकने के लिए)
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

// 4. Owner Panel (/owner) - ओनर के लिए 2 एडवांस बटन्स के साथ
bot.command('owner', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  if (ctx.from.id !== OWNER_ID) return ctx.reply('❌ Unauthorized.');

  const ownerText = 
`🛠️ **Bot Owner Control Panel**

📊 **Statistics:**
- Active Groups Tracked: ${activeGroups.size}
- Active Running Tasks: ${activeTasks.size}

Select an option below:`;

  // ओनर के लिए 2 एडवांस बटन (Active Groups और Broadcast)
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

// Button Actions Handle करना
bot.action('owner_groups', async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return ctx.answerCbQuery('❌ Unauthorized.');
  await ctx.answerCbQuery();
  await ctx.reply(`📋 **Total Active Groups:** ${activeGroups.size}\nAll connected group IDs are being tracked successfully.`);
});

bot.action('owner_broadcast_prompt', async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return ctx.answerCbQuery('❌ Unauthorized.');
  await ctx.answerCbQuery();
  await ctx.reply(`📢 **Broadcast Feature:**\nTo broadcast a message to all groups, reply to this message with your text in format: \`/broadcast Your Message\``);
});

// 5. Broadcast Command for Owner
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
  console.log('🤖 Bot is up and running successfully!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
