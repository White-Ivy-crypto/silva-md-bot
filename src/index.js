require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');
const path = require('path');
const DB = require('./db');
const media = require('./media');
const { isOwner, parseNumberArg } = require('./media');

const OWNER_NUMBER = process.env.OWNER_NUMBER || '';
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || './data/bot.db';
const TMP_DIR = process.env.TMP_DIR || './tmp';

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const db = new DB(DB_PATH);

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'silva-md' }),
  puppeteer: { headless: true }
});

const app = express();

client.on('qr', (qr) => {
  console.log('Scan this QR with WhatsApp mobile:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('WhatsApp client ready');
});

client.initialize();

async function handleIncomingMessage(message) {
  try {
    const chat = await message.getChat();
    const contact = await message.getContact();
    const isGroup = chat.isGroup;

    // identify sender id in groups
    const senderId = message.author || message.from; // author present in groups
    const senderNumber = senderId ? senderId.split('@')[0] : null;
    const senderName = contact.pushname || contact.name || senderNumber;

    // increment message count for topmembers
    if (isGroup && senderId) {
      await db.incrementMessageCount(senderId, senderName);
    }

    // auto-delete if muted
    if (isGroup && senderId) {
      const muted = await db.isMuted(senderId);
      if (muted && message.id) {
        try {
          await message.delete(true);
          console.log('Deleted message from muted user', senderId);
          return;
        } catch (e) {
          console.warn('Failed to delete muted message', e.message);
        }
      }
    }

    // Welcome new members: whatsapp-web.js emits 'group_join' and 'group_leave' events handled below

    // Command parsing
    const body = (message.body || '').trim();
    if (!body) return;

    // ?play public
    if (body.startsWith('?play')) {
      const q = body.replace('?play', '').trim();
      if (!q) return message.reply('Usage: ?play <song name - artist>');
      await message.reply('Searching YouTube for: ' + q);
      const found = await media.searchYouTube(q);
      if (!found) return message.reply('No results found');

      const tempFile = path.join(TMP_DIR, `audio_${Date.now()}.mp3`);
      try {
        await media.downloadAudio(found.url, tempFile);
        const fileData = fs.readFileSync(tempFile);
        const mediaMsg = new MessageMedia('audio/mp3', fileData.toString('base64'));
        await chat.sendMessage(mediaMsg, { sendAudioAsVoice: false });
        fs.unlinkSync(tempFile);
      } catch (e) {
        console.error('Audio download failed', e.message);
        await message.reply('Failed to download audio; here is the link: ' + found.url);
      }
      return;
    }

    // Owner-only commands
    if (body.startsWith('!')) {
      // ensure only owner can run (except any public ones already handled)
      if (!isOwner(senderId, OWNER_NUMBER)) {
        return message.reply('Unauthorized: only the owner can use this command.');
      }

      const parts = body.split(' ');
      const cmd = parts[0].toLowerCase();

      if (cmd === '!kick') {
        const num = parts[1];
        if (!num) return message.reply('Usage: !kick <phone>');
        const participant = parseNumberArg(num);
        try {
          await chat.removeParticipants([participant]);
          return message.reply('Kicked ' + num);
        } catch (e) {
          console.error(e);
          return message.reply('Failed to kick — ensure bot is admin and number is in group. ' + e.message);
        }
      }

      if (cmd === '!topmembers') {
        const rows = await db.getTopMembers(10);
        if (!rows.length) return message.reply('No member data yet.');
        let out = 'Top members by message count:\n';
        rows.forEach((r, i) => out += `${i + 1}. ${r.name || r.id} — ${r.count}\n`);
        return message.reply(out);
      }

      if (cmd === '!changegroupicon') {
        // Expect owner to send an image with this message — we will look for quoted or previous media
        try {
          // try current message media
          if (message.hasMedia) {
            const mediaObj = await message.downloadMedia();
            await chat.setIcon(mediaObj.data ? Buffer.from(mediaObj.data, 'base64') : null);
            return message.reply('Group icon updated');
          }
          // try quoted message
          if (message.hasQuotedMsg) {
            const q = await message.getQuotedMessage();
            if (q.hasMedia) {
              const mediaObj = await q.downloadMedia();
              await chat.setIcon(mediaObj.data ? Buffer.from(mediaObj.data, 'base64') : null);
              return message.reply('Group icon updated');
            }
          }
          return message.reply('Please attach an image or quote an image message when calling !changegroupicon');
        } catch (e) {
          console.error(e);
          return message.reply('Failed to change group icon: ' + e.message);
        }
      }

      if (cmd === '!mute') {
        const num = parts[1];
        if (!num) return message.reply('Usage: !mute <phone>');
        const participant = parseNumberArg(num);
        try {
          await db.muteUser(participant);
          return message.reply('Muted ' + num + '. Their messages will be deleted while muted.');
        } catch (e) {
          console.error(e);
          return message.reply('Failed to mute: ' + e.message);
        }
      }

      if (cmd === '!unmute') {
        const num = parts[1];
        if (!num) return message.reply('Usage: !unmute <phone>');
        const participant = parseNumberArg(num);
        try {
          await db.unmuteUser(participant);
          return message.reply('Unmuted ' + num);
        } catch (e) {
          console.error(e);
          return message.reply('Failed to unmute: ' + e.message);
        }
      }

      if (cmd === '!announcement') {
        const txt = body.replace('!announcement', '').trim();
        if (!txt) return message.reply('Usage: !announcement <text>');
        try {
          await chat.sendMessage(txt);
          return message.reply('Announcement sent');
        } catch (e) {
          console.error(e);
          return message.reply('Failed to send announcement: ' + e.message);
        }
      }

      if (cmd === '!warn') {
        const num = parts[1];
        if (!num) return message.reply('Usage: !warn <phone>');
        const participant = parseNumberArg(num);
        try {
          await db.addWarning(participant);
          const warnings = await db.getWarningsSince(participant, 7 * 24 * 60 * 60 * 1000);
          await message.reply(`Warned ${num}. Warnings in last 7 days: ${warnings.length}`);
          if (warnings.length >= 3) {
            // auto kick
            try {
              await chat.removeParticipants([participant]);
              await message.reply(`${num} had 3 warnings in 7 days and was auto-kicked.`);
            } catch (e) {
              await message.reply(`Failed to auto-kick ${num}: ${e.message}`);
            }
          }
        } catch (e) {
          console.error(e);
          return message.reply('Failed to warn: ' + e.message);
        }
      }

      if (cmd === '!postongroupstatus') {
        // attempt to take attached media (or quoted) and re-send to group (and attempt to set status if supported)
        try {
          let mediaObj = null;
          if (message.hasMedia) mediaObj = await message.downloadMedia();
          else if (message.hasQuotedMsg) {
            const q = await message.getQuotedMessage();
            if (q.hasMedia) mediaObj = await q.downloadMedia();
          }
          if (!mediaObj) return message.reply('Attach a photo/video or quote a message with media to post on group status');

          // resend to group (effectively posting it)
          const mediaMsg = new MessageMedia(mediaObj.mimetype, mediaObj.data, mediaObj.filename);
          await chat.sendMessage(mediaMsg, { caption: 'Posted by owner to group status' });

          // try to set status (this may not be supported by the library)
          if (client.setStatus) {
            try {
              const buffer = Buffer.from(mediaObj.data, 'base64');
              await client.setStatus(buffer);
            } catch (e) {
              // ignore
            }
          }

          return message.reply('Posted to group (and attempted status update).');
        } catch (e) {
          console.error(e);
          return message.reply('Failed to post: ' + e.message);
        }
      }

      if (cmd === '!praise') {
        const num = parts[1];
        if (!num) return message.reply('Usage: !praise <phone>');
        const participant = parseNumberArg(num);
        const display = parts.slice(2).join(' ') || '';
        const text = `Hey ${num}! You rock ✨🔥\n${display || 'You are awesome and loved by the group! #hype'}`;
        try {
          await chat.sendMessage(text, { mentions: [] });
          return message.reply('Praised ' + num);
        } catch (e) {
          console.error(e);
          return message.reply('Failed to praise: ' + e.message);
        }
      }

      if (cmd === '!summarisechats') {
        // basic extractive summary: gather last 200 group messages and show shortened text
        try {
          const msgs = await chat.fetchMessages({ limit: 200 });
          const texts = msgs.filter(m => m.body).map(m => m.body).slice(-100);
          if (!texts.length) return message.reply('No recent chat text to summarise.');
          // simple heuristic: take the most common sentences/lines
          const joined = texts.join('\n');
          // crude: take top 5 longest unique lines
          const lines = joined.split('\n').map(s => s.trim()).filter(Boolean);
          const unique = Array.from(new Set(lines));
          unique.sort((a,b) => b.length - a.length);
          const top = unique.slice(0, 6).join('\n\n');
          await message.reply('Recent highlights:\n\n' + top);
        } catch (e) {
          console.error(e);
          return message.reply('Failed to summarise: ' + e.message);
        }
      }

      // unknown owner command
      return message.reply('Unknown command or wrong format.');
    }

  } catch (e) {
    console.error('handleIncomingMessage error', e.message);
  }
}

client.on('messageCreate', async (message) => {
  // handle incoming
  await handleIncomingMessage(message);
});

// welcome new members (group_join event)
client.on('group_join', async (notification) => {
  try {
    const chat = await notification.getChat();
    const id = notification.id || notification.author;
    if (notification.recipientIds) {
      for (const p of notification.recipientIds) {
        await chat.sendMessage(`Welcome @${p.split('@')[0]}! Welcome to the group ❤️`, { mentions: [await client.getContactById(p)] });
      }
    }
  } catch (e) {
    console.warn('group_join handler failed', e.message);
  }
});

// small express server for status
app.get('/', (req, res) => res.send('Silva MD Bot prototype running'));
app.listen(PORT, () => console.log(`Status server on http://localhost:${PORT}`));
