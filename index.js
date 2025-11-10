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

// Increase payload size limit to handle large images (50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
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
// OR { "number": "+919876543210", "invoiceUrl": "data:application/pdf;base64,..." }
app.post("/send-invoice", async (req, res) => {
  try {
    if (!sock) return res.status(503).json({ error: "WhatsApp not connected yet", success: false });

    const { number, invoiceUrl, message } = req.body;
    if (!number) return res.status(400).json({ error: "Customer number is required", success: false });

    const jid = number.replace(/\D/g, "") + "@s.whatsapp.net";

    // Optional text before invoice
    if (message) {
      await sock.sendMessage(jid, { text: message });
    }

    if (invoiceUrl) {
      // Check if it's a base64 data URL
      if (invoiceUrl.startsWith("data:application/pdf;base64,")) {
        // Extract base64 data and convert to buffer
        const base64Data = invoiceUrl.split("base64,")[1];
        const pdfBuffer = Buffer.from(base64Data, "base64");
        
        await sock.sendMessage(jid, {
          document: pdfBuffer,
          mimetype: "application/pdf",
          fileName: "Invoice.pdf",
          caption: "📄 Here is your invoice.",
        });
      } else {
        // It's a regular URL
        await sock.sendMessage(jid, {
          document: { url: invoiceUrl },
          mimetype: "application/pdf",
          fileName: "Invoice.pdf",
          caption: "📄 Here is your invoice.",
        });
      }
    }

    console.log(`✅ Invoice sent successfully to ${number}`);
    res.json({ success: true, message: "Invoice sent successfully!" });
  } catch (err) {
    console.error("❌ Failed to send invoice:", err);
    res.status(500).json({ success: false, error: err.message });
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

// === API Endpoint for Sending Image ===
// Example POST request:
// { "number": "+919876543210", "imageUrl": "https://example.com/image.jpg", "caption": "Check this out!" }
// OR { "number": "+919876543210", "imageUrl": "data:image/jpeg;base64,...", "caption": "Check this out!" }
// OR { "number": "+919876543210", "imagePath": "/path/to/local/image.jpg", "caption": "Check this out!" }
app.post("/send-image", async (req, res) => {
  try {
    console.log("📥 Received /send-image request:", {
      number: req.body.number,
      hasImageUrl: !!req.body.imageUrl,
      hasImagePath: !!req.body.imagePath,
      caption: req.body.caption,
      bodySize: JSON.stringify(req.body).length
    });

    if (!sock) return res.status(503).json({ error: "WhatsApp not connected yet", success: false });

    const { number, imageUrl, imagePath, caption } = req.body;
    if (!number) {
      console.log("❌ Missing phone number");
      return res.status(400).json({ error: "Phone number is required", success: false });
    }
    if (!imageUrl && !imagePath) {
      console.log("❌ Missing image URL or path");
      return res.status(400).json({ error: "Image URL or image path is required", success: false });
    }

    const jid = number.replace(/\D/g, "") + "@s.whatsapp.net";
    console.log(`📞 Sending to JID: ${jid}`);

    // Handle local file path
    if (imagePath) {
      console.log(`📂 Attempting to read file from: ${imagePath}`);
      if (!fs.existsSync(imagePath)) {
        console.log(`❌ File not found: ${imagePath}`);
        return res.status(404).json({ error: "Image file not found at specified path", success: false });
      }
      
      const imageBuffer = fs.readFileSync(imagePath);
      console.log(`✅ File read successfully, size: ${imageBuffer.length} bytes`);
      
      await sock.sendMessage(jid, {
        image: imageBuffer,
        caption: caption || "",
      });
      console.log(`✅ Image sent successfully to ${number} from path: ${imagePath}`);
      return res.json({ success: true, message: "Image sent successfully!" });
    }

    // Check if it's a base64 data URL
    if (imageUrl.startsWith("data:image/")) {
      console.log("📦 Processing base64 image");
      // Extract base64 data and convert to buffer
      const base64Data = imageUrl.split("base64,")[1];
      const imageBuffer = Buffer.from(base64Data, "base64");
      console.log(`✅ Base64 decoded, size: ${imageBuffer.length} bytes`);
      
      await sock.sendMessage(jid, {
        image: imageBuffer,
        caption: caption || "",
      });
    } else {
      console.log(`🌐 Processing URL image: ${imageUrl.substring(0, 100)}...`);
      // It's a regular URL
      await sock.sendMessage(jid, {
        image: { url: imageUrl },
        caption: caption || "",
      });
    }

    console.log(`✅ Image sent successfully to ${number}`);
    res.json({ success: true, message: "Image sent successfully!" });
  } catch (err) {
    console.error("❌ Failed to send image:", err);
    console.error("❌ Error details:", {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
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
      sendInvoice: "POST /send-invoice",
      sendImage: "POST /send-image"
    }
  });
});

// === Start Express + WhatsApp Bot ===
http.createServer(app).listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

startWhatsAppBot();
