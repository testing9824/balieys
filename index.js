// ==========================================================
// Baileys WhatsApp API Bot (Render-Compatible Version)
// Works on Render Free Plan by adding a dummy HTTP server.
// ==========================================================

// === 1. Dummy HTTP server for Render ===
const http = require('http');
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('✅ Baileys WhatsApp bot is running\n');
  })
  .listen(PORT, () => console.log('🌐 Web server running on port', PORT));

// === 2. Normal Baileys bot code ===
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

// Logger configuration
const logger = P({ level: 'silent' });

// Authentication folder
const AUTH_FOLDER = './auth_info_baileys';

async function startWhatsAppBot() {
  try {
    if (!fs.existsSync(AUTH_FOLDER)) {
      fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
      version,
      logger,
      auth: state,
      browser: ['Baileys Bot', 'Chrome', '10.0'],
      defaultQueryTimeoutMs: undefined,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n📱 Scan this QR Code with WhatsApp:\n');
        qrcode.generate(qr, { small: true });
        console.log('\nOpen WhatsApp > Linked Devices > Link a Device\n');
      }

      if (connection === 'close') {
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('Connection closed. Reconnecting:', shouldReconnect);

        if (shouldReconnect) {
          setTimeout(startWhatsAppBot, 3000);
        } else {
          console.log(
            '❌ Logged out. Delete auth_info_baileys folder and restart to login again.'
          );
        }
      } else if (connection === 'open') {
        console.log('✅ Connected to WhatsApp successfully!');
        console.log(`📞 Bot Number: ${sock.user.id}`);
      }
    });

    // Message handler
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      const msg = messages[0];
      if (!msg.message) return;

      const from = msg.key.remoteJid;
      const isGroup = from.endsWith('@g.us');
      const msgContent =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        '';

      console.log(`\n📨 Message from ${isGroup ? 'Group' : 'User'} ${from}: ${msgContent}`);

      if (isGroup) return;

      if (['hi', 'hello'].includes(msgContent.toLowerCase())) {
        await sock.sendMessage(from, {
          text: '👋 Hello! I am a Baileys WhatsApp bot. How can I help you?',
        });
      }

      if (msgContent.toLowerCase() === '!ping') {
        await sock.sendMessage(from, { text: '🏓 Pong! Bot is active.' });
      }

      if (msgContent.toLowerCase() === '!help') {
        const helpText =
          `*Available Commands:*\n\n` +
          `• hi/hello - Get a greeting\n` +
          `• !ping - Check if bot is active\n` +
          `• !help - Show this help message\n` +
          `• !info - Get bot information\n` +
          `• !image - Get a test image\n` +
          `• !sticker - Get a test sticker`;
        await sock.sendMessage(from, { text: helpText });
      }

      if (msgContent.toLowerCase() === '!info') {
        const infoText =
          `*Bot Information*\n\n` +
          `📱 Bot Number: ${sock.user.id}\n` +
          `🤖 Library: Baileys v7.0.0\n` +
          `⚡ Status: Active\n` +
          `🔗 Multi-device: Yes`;
        await sock.sendMessage(from, { text: infoText });
      }

      if (msgContent.toLowerCase() === '!image') {
        await sock.sendMessage(from, {
          image: { url: 'https://picsum.photos/400/300' },
          caption: '📸 Here is a random test image!',
        });
      }

      if (msgContent.toLowerCase() === '!sticker') {
        await sock.sendMessage(from, {
          sticker: { url: 'https://picsum.photos/512/512' },
        });
      }
    });

    sock.ev.on('groups.upsert', (groups) => {
      console.log('📢 New groups detected:', groups.length);
    });

    return sock;
  } catch (err) {
    console.error('❌ Error starting bot:', err);
    setTimeout(startWhatsAppBot, 5000);
  }
}

console.log('🚀 Starting Baileys WhatsApp Bot...\n');
startWhatsAppBot();

process.on('SIGINT', () => {
  console.log('\n👋 Bot shutting down gracefully...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});
