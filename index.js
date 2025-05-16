const qrcode = require('qrcode-terminal');
const fetch = require('node-fetch');
const { Client, LocalAuth } = require('whatsapp-web.js');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// WhatsApp client setup
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true }
});

// Server list
const SERVERS = [
    {
        id: "python_server",
        url: "http://103.100.201.107/",
        phone: "+919701179454",
        name: "Python Server"
    },
    {
        id: "apache_server",
        url: "http://103.100.201.107/",
        phone: "+919110335495",
        name: "Apache Server"
    }
];

// Track status
const STATUS_TRACKER = {};
const CHECK_INTERVAL = 10000; // 10 seconds

client.on('qr', (qr) => {
    console.log('📱 Scan the QR code to log in:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ WhatsApp client is ready!');
    monitorServers(); // start monitoring after client is ready
});

client.initialize();

// Function to send WhatsApp messages
async function sendWhatsAppMessage(phone, message) {
    const number = phone.replace('+', '') + '@c.us';
    try {
        await client.sendMessage(number, message);
        console.log(`📤 Sent to ${phone}: ${message}`);
    } catch (err) {
        console.error(`❌ Failed to send to ${phone}:`, err.message);
    }
}

// Monitor servers continuously
function monitorServers() {
    SERVERS.forEach(server => {
        STATUS_TRACKER[server.id] = null;
    });

    setInterval(async () => {
        for (const server of SERVERS) {
            const { id, url, phone, name } = server;
            let isUp = false;

            try {
                const res = await fetch(url, { timeout: 5000 });
                isUp = res.ok;
            } catch (err) {
                isUp = false;
            }

            const wasUp = STATUS_TRACKER[id];
            STATUS_TRACKER[id] = isUp;

            if (wasUp === null) continue; // first time, skip alert

           if (isUp && !wasUp) {
                const now = new Date().toLocaleString();
                const msg = `✅ ${name} is now UP and reachable. 🕒 Time: ${now}`;
                await sendWhatsAppMessage(phone, msg);
            } else if (!isUp && wasUp) {
                const now = new Date().toLocaleString();
                const msg = `⚠️ ALERT: ${name} is DOWN or unreachable! 🕒 Time: ${now}`;
                await sendWhatsAppMessage(phone, msg);
            }
        }

        console.log('🔁 Checked all servers.');
    }, CHECK_INTERVAL);
}
