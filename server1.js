const qrcode = require('qrcode-terminal');
const fetch = require('node-fetch');
const { Client, LocalAuth } = require('whatsapp-web.js');
const mysql = require('mysql2/promise');

// Disable SSL verification (only for dev)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// DB connection
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    database: 'pdns',
    password: '',
    port: 3306
});

// WhatsApp client setup with persistent auth
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "monitor-bot" }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

const STATUS_TRACKER = {};
const CHECK_INTERVAL = 10000;

// Show QR code
client.on('qr', (qr) => {
    console.log('📱 Scan this QR code:');
    qrcode.generate(qr, { small: true });
});

// Ready
client.on('ready', async () => {
    console.log('✅ WhatsApp client is ready!');
    const servers = await getServersFromDB();
    if (servers.length === 0) return console.log('⚠️ No servers found.');
    console.log('🖥️ Monitoring servers:', servers.map(s => s.primaryip).join(', '));
    monitorServers(servers);
});

// Handle disconnects
client.on('disconnected', (reason) => {
    console.warn('⚠️ Disconnected:', reason);
});

// Auth failure (don't delete session anymore)
client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
});

// Connection state changes
client.on('change_state', (state) => {
    console.log(`🔄 State changed: ${state}`);
});

// Start client
(async () => {
    try {
        await client.initialize();
    } catch (err) {
        console.error('❌ Initialization error:', err.message);
        process.exit(1);
    }
})();

// Fetch servers from DB
async function getServersFromDB() {
    try {
        const [rows] = await pool.query('SELECT id, primaryip, phonenumber, check_type FROM healthcheck');
        return rows;
    } catch (err) {
        console.error('❌ DB fetch error:', err.message);
        return [];
    }
}

// Send message
async function sendWhatsAppMessage(phone, message) {
    const number = phone.replace('+', '') + '@c.us';
    try {
        await client.sendMessage(number, message);
        console.log(`📤 Sent to ${phone}: ${message}`);
    } catch (err) {
        console.error(`❌ Send error to ${phone}: ${err.message}`);
    }
}

// Monitor servers

function monitorServers(SERVERS) {
    SERVERS.forEach(server => {
        STATUS_TRACKER[server.id] = null;
    });

    (async () => {
        for (let i = SERVERS.length - 1; i >= 0; i--) {
            const server = SERVERS[i];
            const { id, primaryip, phonenumber, check_type } = server;
            const url = `${check_type}://${primaryip}`;

            const name = primaryip;
            let isUp = false;

            try {
                const res = await fetch(url, { timeout: 5000 });
                isUp = res.ok;
            } catch {
                isUp = false;
            }

            const wasUp = STATUS_TRACKER[id];

            if (wasUp === null) {
                STATUS_TRACKER[id] = isUp;
                console.log(`📡 Initial check ${name}: ${isUp ? 'UP' : 'DOWN'}`);
                continue;
            }

            if (isUp !== wasUp) {
                const numbers = phonenumber.split(',').map(p => p.trim());
                const msg = isUp
                    ? `✅ ${name} is now UP and reachable.`
                    : `⚠️ ALERT: ${name} is DOWN or unreachable!`;

                for (const number of numbers) {
                    await sendWhatsAppMessage(number, msg);
                }

                STATUS_TRACKER[id] = isUp;
                console.log(`🛑 ${name} alert sent.`);
            }
        }

        console.log('🔁 One check cycle completed. Stopping monitoring.');
        process.exit(0); // This will stop the Node.js script
    })();
}

