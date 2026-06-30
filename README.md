# Silva MD Bot - WhatsApp prototype

This branch contains a prototype WhatsApp group bot using whatsapp-web.js.

Features included:
- QR pairing using LocalAuth (session persisted to disk)
- Owner-only admin commands: !kick, !mute, !changegroupicon, !announcement, !warn, !praise, !summarisechats, !postongroupstatus, !topmembers, !summarisechats
- Public command: ?play <song - artist> (searches YouTube and sends audio)
- Message counting (SQLite) for !topmembers
- Warnings tracking; 3 warnings within 7 days auto-kick
- Welcome new members
- Muted members: bot auto-deletes their messages

Important notes
- You must make the bot's WhatsApp session/admin number an admin in the group for admin actions to succeed.
- This uses the WhatsApp Web protocol — suitable for prototypes and small personal groups. Long-term use may violate WhatsApp terms.

Run
1. Copy `.env.example` to `.env` and set values (OWNER_NUMBER required).
2. npm install
3. npm start

QR and pairing are exposed in console output. Use a VPS with ffmpeg installed or included via ffmpeg-static (we configure that already).
