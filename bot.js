const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const OWNER_ID = parseInt(process.env.OWNER_ID || '123456789');

const bot = new Telegraf(BOT_TOKEN);

const activeTasks = new Map();
const activeGroups = new Set();
// ग्रुप के मेंबर्स को सेव करने के लिए मेमोरी डेटाबेस
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

// ग्रुप के हर मैसेज पर यूजर को कलेक्ट करना (ताकि टैग करने के लिए असली लोग मिल सकें)
bot.on('message', (ctx, next) => {
  if (ctx.chat && ctx.chat.type !== 'private' && ctx.from) {
    const chatId = ctx.chat.id;
    if (!groupMembers.has(chatId)) {
      groupMembers.set(chatId, new Map());
    }
    const membersMap = groupMembers.get(chatId);
    const name = ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : '');
    membersMap.set(ctx.from.id, { id: ctx.from.id, name: name });
  }
  return next();
});

// 1. /start Command
bot.start(async (ctx) => {
  if (ctx.chat.type !== 'private') {
    return ctx.reply('⚠️ Please use the /start command in my private chat.');
  }

  const welcomeText = 
`🤖 Welcome to Mass Tagging Bot!

Commands:
🔹 /mtag <Message/Link> - Tags real group members in batches of 10 in your style. (Admin Only)
🔹 /mcancel - Stops tagging. (Admin Only)
🔹 /reload - Refreshes the bot. (Admin Only)`;
  
  await ctx.reply(welcomeText);
});

// 2. /mtag Command (Real Members Tagging)
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
    return ctx.reply('⚠️ Tagging is already running. Use /mcancel to stop.');
  }

  const args = ctx.message.text.split(' ').slice(1).join(' ');
  if (!args) {
    return ctx.reply('⚠️ Please provide a link or message!\nExample: /mtag https://t.me/...');
  }

  // Check collected members
  const membersMap = groupMembers.get(chatId);
  if (!membersMap || membersMap.size === 0) {
    return ctx.reply('⚠️ No members found in cache yet! Let some members chat first or send a message so I can detect them.');
  }

  const membersList = Array.from(membersMap.values());
  const adminName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  
  await ctx.reply(`🚀 Tagging Started!\nInitiated by: ${adminName}`);

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
        await ctx.reply(`✅ Tagging Completed Successfully for all members!`);
        return;
      }

      const currentBatch = membersList.slice(index, index + batchSize);
      
      // आपके स्क्रीनشॉट वाला फॉर्मेट: ऊपर लिंक, नीचे कॉमा लगाकर सबके क्लिकेबल नाम
      let formattedText = `${args}\n\n`;
      const nameLinks = currentBatch.map(m => `[${m.name}](tg://user?id=${m.id})`);
      formattedText += nameLinks.join(', ');

      await ctx.reply(formattedText, { parse_mode: 'Markdown' });

      index += batchSize;
    }, 4000); // 4 सेकंड का गैप ताकि Telegram बैन (FloodWait) न करे

    activeTasks.set(chatId, interval);

  } catch (error) {
    activeTasks.delete(chatId);
    await ctx.reply('❌ An error occurred during tagging.');
  }
});

// 3. /mcancel Command
bot.command('mcancel', async (ctx) => {
  if (ctx.chat.type === 'private') return;
  if (!(await isAdmin(ctx))) return ctx.reply('❌ Admin only.');

  const chatId = ctx.chat.id;
  if (activeTasks.has(chatId)) {
    clearInterval(activeTasks.get(chatId));
    activeTasks.delete(chatId);
    await ctx.reply('🛑 Tagging Cancelled Successfully.');
  } else {
    await ctx.reply('⚠️ No active tagging process running.');
  }
});

// 4. /reload Command
bot.command('reload', async (ctx) => {
  if (ctx.chat.type === 'private') return;
  if (!(await isAdmin(ctx))) return ctx.reply('❌ Admin only.');

  const chatId = ctx.chat.id;
  if (activeTasks.has(chatId)) {
    clearInterval(activeTasks.get(chatId));
    activeTasks.delete(chatId);
  }
  await ctx.reply('🔄 Bot reloaded for this group!');
});

// 5. Owner Panel
bot.command('owner', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  if (ctx.from.id !== OWNER_ID) return ctx.reply('❌ Unauthorized.');

  await ctx.reply(`🛠️ Owner Panel\n- Active Groups: ${activeGroups.size}\n- Active Tasks: ${activeTasks.size}`);
});

bot.launch().then(() => {
  console.log('🤖 Bot is running smoothly!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
