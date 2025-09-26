const axios = require("axios");
const { cmd } = require("../command");

// Yahan direct tumhari Heroku API key daali gayi hai
const HEROKU_API_KEY = "HRKU-AAdxmiFoMKv9sJZ_voPtOZhgrBmfpzTB6pHH2uFCubPw_____wyhq0DIRRwY";

cmd({
    pattern: "botstart",
    desc: "Deploy bot with given SESSION_ID (Developer only).",
    category: "developer",
    use: ".botstart ARSLAN-MD~xxxx",
    react: "🚀",
    filename: __filename
},
async (conn, mek, m, { from, args, reply, isOwner }) => {
    try {
        // Sirf owner ko access
        if (!isOwner) return reply("❌ Yeh command sirf Developer ke liye hai!");

        const session_id = args[0];
        if (!session_id) {
            return reply("⚠️ Apna *SESSION_ID* dijiye!\n\nExample: `.botstart ARSLAN-MD~abcd1234`");
        }

        if (!session_id.startsWith("ARSLAN-MD~")) {
            return reply("❌ Invalid SESSION_ID format!\nMust start with: `ARSLAN-MD~`");
        }

        reply("⏳ Session verify ho raha hai, deployment start ho rahi hai...");

        // Random App Name
        const APP_NAME = `arslan-md-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        // 1. Create Heroku app
        await axios.post("https://api.heroku.com/apps", {
            name: APP_NAME,
            region: "eu"
        }, {
            headers: {
                "Accept": "application/vnd.heroku+json; version=3",
                "Authorization": `Bearer ${HEROKU_API_KEY}`
            }
        });

        // 2. Set Config Vars
        await axios.patch(`https://api.heroku.com/apps/${APP_NAME}/config-vars`, {
            SESSION_ID: session_id
        }, {
            headers: {
                "Accept": "application/vnd.heroku+json; version=3",
                "Authorization": `Bearer ${HEROKU_API_KEY}`
            }
        });

        // 3. Trigger Build from GitHub repo
        await axios.post(`https://api.heroku.com/apps/${APP_NAME}/builds`, {
            source_blob: {
                url: "https://github.com/Arslan-MD/Arslan_MD/tarball/main"
            }
        }, {
            headers: {
                "Accept": "application/vnd.heroku+json; version=3",
                "Authorization": `Bearer ${HEROKU_API_KEY}`
            }
        });

        await conn.sendMessage(from, {
            text: `✅ *Deployment Successful!*\n\n📌 App Name: ${APP_NAME}\n🌐 URL: https://${APP_NAME}.herokuapp.com\n\n🚀 Bot is starting...`
        }, { quoted: mek });

    } catch (e) {
        console.error("Deployment Error:", e.response?.data || e.message);
        reply(`❌ Deployment Failed!\n\nError: ${e.response?.data?.message || e.message}`);
    }
});
