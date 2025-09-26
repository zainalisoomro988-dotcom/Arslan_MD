import fetch from "node-fetch";

// Sirf in numbers ko developer mana jayega
const DEVELOPERS = ["923237045919@s.whatsapp.net"]; // apna number daalna

cmd({
  pattern: "botstart",
  desc: "Deploy bot to Heroku",
  category: "developer",
  react: "🚀",
  filename: __filename
}, async (conn, m, { text, sender }) => {
  if (!DEVELOPERS.includes(sender)) {
    return m.reply("❌ Ye command sirf developer ke liye hai.");
  }

  if (!text) return m.reply("⚠️ Session ID missing.\nUse: .botstart ARSLAN-MD~xxxx");

  const SESSION_ID = text.trim();
  const HEROKU_API_KEY = "HRKU-AAdxmiFoMKv9sJZ_voPtOZhgrBmfpzTB6pHH2uFCubPw_____wyhq0DIRRwY"; // apni API key dalni hogi
  const APP_NAME = "arslan-md-" + Date.now(); // her app ke liye unique name

  try {
    // Step 1: Create app
    let res = await fetch("https://api.heroku.com/apps", {
      method: "POST",
      headers: {
        "Accept": "application/vnd.heroku+json; version=3",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${HEROKU_API_KEY}`
      },
      body: JSON.stringify({ name: APP_NAME })
    });

    if (!res.ok) throw new Error("App create failed.");
    let app = await res.json();

    // Step 2: Set config vars
    await fetch(`https://api.heroku.com/apps/${APP_NAME}/config-vars`, {
      method: "PATCH",
      headers: {
        "Accept": "application/vnd.heroku+json; version=3",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${HEROKU_API_KEY}`
      },
      body: JSON.stringify({
        SESSION_ID,
        PLATFORM: "HEROKU"
      })
    });

    // Step 3: Scale dyno
    await fetch(`https://api.heroku.com/apps/${APP_NAME}/formation`, {
      method: "PATCH",
      headers: {
        "Accept": "application/vnd.heroku+json; version=3",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${HEROKU_API_KEY}`
      },
      body: JSON.stringify([
        { type: "web", quantity: 1, size: "free" }
      ])
    });

    m.reply(`✅ Bot deployed successfully!\n\n🔹 App Name: ${APP_NAME}\n🔹 Session: ${SESSION_ID}`);
  } catch (e) {
    m.reply(`❌ Error: ${e.message}`);
  }
});
