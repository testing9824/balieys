// ==========================================================
// WhatsApp Invoice Sender Bot (Baileys + Express)
// Author: GPT-5 | 2025
// ==========================================================

// === Import Modules ===
const express = require("express");
const http = require("http");
const fs = require("fs");
const qrcode = require("qrcode-terminal");
const P = require("pino");
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

// === App Setup ===
const app = express();

// Enable CORS for all origins (or specify your frontend URL)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
const PORT = process.env.PORT || 3000;

// === WhatsApp Bot Variables ===
const logger = P({ level: "silent" });
const AUTH_FOLDER = "./auth_info_baileys";
let sock; // Global socket instance

// === WhatsApp Bot Startup ===
async function startWhatsAppBot() {
  try {
    if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      logger,
      auth: state,
      printQRInTerminal: false,
      browser: ["InvoiceBot", "Chrome", "10.0"],
      defaultQueryTimeoutMs: undefined,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("\n📱 Scan this QR Code to log in:\n");
        qrcode.generate(qr, { small: true });
        console.log("\nOpen WhatsApp → Linked Devices → Link a Device\n");
      }

      if (connection === "open") {
        console.log("✅ WhatsApp connected successfully!");
        console.log(`📞 Logged in as: ${sock.user.id}`);
      } else if (connection === "close") {
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log("Connection closed. Reconnecting:", shouldReconnect);
        if (shouldReconnect) setTimeout(startWhatsAppBot, 3000);
      }
    });

    // Optional — handle incoming messages
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      const msg = messages[0];
      if (!msg.message) return;

      const from = msg.key.remoteJid;
      const text =
        msg.message.conversation || msg.message.extendedTextMessage?.text || "";

      console.log(`💬 Message from ${from}: ${text}`);

      if (text.toLowerCase() === "hi") {
        await sock.sendMessage(from, {
          text: "👋 Hello! This is your Invoice Assistant bot.",
        });
      }
    });
  } catch (err) {
    console.error("❌ Error starting WhatsApp bot:", err);
    setTimeout(startWhatsAppBot, 5000);
  }
}

// === API Endpoint for Sending Invoice ===
// Example POST request:
// { "number": "+919876543210", "invoiceUrl": "https://example.com/invoice.pdf" }
app.post("/send-invoice", async (req, res) => {
  try {
    if (!sock) return res.status(503).json({ error: "WhatsApp not connected yet" });

    const { number, invoiceUrl, message } = req.body;
    if (!number) return res.status(400).json({ error: "Customer number is required" });

    const jid = number.replace(/\D/g, "") + "@s.whatsapp.net";

    // Optional text before invoice
    if (message) {
      await sock.sendMessage(jid, { text: message });
    }

    if (invoiceUrl) {
      await sock.sendMessage(jid, {
        document: { url: invoiceUrl },
        mimetype: "application/pdf",
        fileName: "Invoice.pdf",
        caption: "📄 Here is your invoice.",
      });
    }

    console.log(`✅ Invoice sent successfully to ${number}`);
    res.json({ success: true, message: "Invoice sent successfully!" });
  } catch (err) {
    console.error("❌ Failed to send invoice:", err);
    res.status(500).json({ error: err.message });
  }
});

// === API Endpoint for Sending Simple Message (for testing) ===
app.post("/send-message", async (req, res) => {
  try {
    if (!sock) return res.status(503).json({ error: "WhatsApp not connected yet", success: false });

    const { number, message } = req.body;
    if (!number) return res.status(400).json({ error: "Phone number is required", success: false });
    if (!message) return res.status(400).json({ error: "Message is required", success: false });

    const jid = number.replace(/\D/g, "") + "@s.whatsapp.net";

    await sock.sendMessage(jid, { text: message });

    console.log(`✅ Message sent successfully to ${number}`);
    res.json({ success: true, message: "Message sent successfully!" });
  } catch (err) {
    console.error("❌ Failed to send message:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// === API Endpoint to Check WhatsApp Status ===
app.get("/status", (req, res) => {
  if (!sock) {
    return res.json({ 
      connected: false, 
      message: "WhatsApp not connected. Please scan QR code." 
    });
  }
  
  res.json({ 
    connected: true, 
    user: sock.user?.id || "Connected",
    message: "WhatsApp is connected and ready!" 
  });
});

// === Root Route ===
app.get("/", (req, res) => {
  const isConnected = sock ? true : false;
  res.json({
    status: "running",
    whatsapp: isConnected ? "connected" : "not connected",
    message: "✅ WhatsApp Invoice Bot is running!",
    endpoints: {
      status: "GET /status",
      sendMessage: "POST /send-message",
      sendInvoice: "POST /send-invoice"
    }
  });
});

// === Start Express + WhatsApp Bot ===
http.createServer(app).listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

startWhatsAppBot();
