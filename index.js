// Baileys WhatsApp API Test Setup (2025)
// Requires Node.js 17+ and @whiskeysockets/baileys

const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

// Logger configuration
const logger = P({ level: 'silent' }); // Change to 'debug' for detailed logs

// Authentication folder
const AUTH_FOLDER = './auth_info_baileys';

async function startWhatsAppBot() {
    try {
        // Ensure auth folder exists
        if (!fs.existsSync(AUTH_FOLDER)) {
            fs.mkdirSync(AUTH_FOLDER, { recursive: true });
        }

        // Load authentication state
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
        
        // Fetch latest Baileys version
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

        // Create WhatsApp socket connection
        const sock = makeWASocket({
            version,
            logger,
            auth: state,
            browser: ['Baileys Bot', 'Chrome', '10.0'],
            defaultQueryTimeoutMs: undefined,
        });

        // Save credentials on update
        sock.ev.on('creds.update', saveCreds);

        // Connection update handler
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            // Handle QR code display
            if (qr) {
                console.log('\n📱 Scan this QR Code with WhatsApp:\n');
                qrcode.generate(qr, { small: true });
                console.log('\nOpen WhatsApp > Linked Devices > Link a Device\n');
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Connection closed. Reconnecting:', shouldReconnect);
                
                if (shouldReconnect) {
                    setTimeout(startWhatsAppBot, 3000);
                } else {
                    console.log('❌ Logged out. Delete auth_info_baileys folder and restart to login again.');
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
            const msgContent = msg.message.conversation || 
                             msg.message.extendedTextMessage?.text || '';

            console.log(`\n📨 Message from ${isGroup ? 'Group' : 'User'} ${from}: ${msgContent}`);

            // Ignore group messages (optional - remove this if you want to handle groups)
            if (isGroup) return;

            // Simple auto-reply example
            if (msgContent.toLowerCase() === 'hi' || msgContent.toLowerCase() === 'hello') {
                await sock.sendMessage(from, { 
                    text: '👋 Hello! I am a Baileys WhatsApp bot. How can I help you?' 
                });
                console.log('✅ Reply sent!');
            }

            // Command: !ping
            if (msgContent.toLowerCase() === '!ping') {
                await sock.sendMessage(from, { 
                    text: '🏓 Pong! Bot is active.' 
                });
            }

            // Command: !help
            if (msgContent.toLowerCase() === '!help') {
                const helpText = `*Available Commands:*\n\n` +
                    `• hi/hello - Get a greeting\n` +
                    `• !ping - Check if bot is active\n` +
                    `• !help - Show this help message\n` +
                    `• !info - Get bot information\n` +
                    `• !image - Get a test image\n` +
                    `• !sticker - Get a test sticker`;
                
                await sock.sendMessage(from, { text: helpText });
            }

            // Command: !info
            if (msgContent.toLowerCase() === '!info') {
                const infoText = `*Bot Information*\n\n` +
                    `📱 Bot Number: ${sock.user.id}\n` +
                    `🤖 Library: Baileys v7.0.0\n` +
                    `⚡ Status: Active\n` +
                    `🔗 Multi-device: Yes`;
                
                await sock.sendMessage(from, { text: infoText });
            }

            // Command: !image - Send an image example
            if (msgContent.toLowerCase() === '!image') {
                await sock.sendMessage(from, {
                    image: { url: 'https://picsum.photos/400/300' },
                    caption: '📸 Here is a random test image!'
                });
            }

            // Command: !sticker - Send a sticker example
            if (msgContent.toLowerCase() === '!sticker') {
                await sock.sendMessage(from, {
                    sticker: { url: 'https://picsum.photos/512/512' }
                });
            }
        });

        // Group updates handler
        sock.ev.on('groups.upsert', (groups) => {
            console.log('📢 New groups detected:', groups.length);
        });

        // Typing indicator example (commented out)
        // sock.ev.on('messages.upsert', async ({ messages }) => {
        //     const msg = messages[0];
        //     const from = msg.key.remoteJid;
        //     await sock.sendPresenceUpdate('composing', from);
        //     setTimeout(() => sock.sendPresenceUpdate('paused', from), 3000);
        // });

        return sock;

    } catch (err) {
        console.error('❌ Error starting bot:', err);
        setTimeout(startWhatsAppBot, 5000);
    }
}

// Start the bot
console.log('🚀 Starting Baileys WhatsApp Bot...\n');
startWhatsAppBot();

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('\n👋 Bot shutting down gracefully...');
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});