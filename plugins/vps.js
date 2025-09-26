// plugins/vps.js
// Arslan-MD .vps plugin
// Usage:
// 1) .vps <github_username>
// 2) .session ARSLAN-MD~xxxxxxx

import axios from "axios";
import fs from "fs";
import path from "path";

const VPS_BASE = (global?.config?.VPS_API_BASE) || "https://arslan-md-free-vps.onrender.com";
const DEPLOY_PATH = "/deploy";
const OWNER_NUMBER = (global?.config?.OWNER_NUMBER) || "923237045919"; // e.g. "92300XXXXXXX"
const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "vps_flow.json");

// ensure data dir + file
function ensureStateFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, JSON.stringify({ flows: {} }, null, 2));
}
function loadState() {
  ensureStateFile();
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return { flows: {} }; }
}
function saveState(state) {
  ensureStateFile();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// GitHub fork verification (same logic as your server)
async function verifyForkOnGitHub(username) {
  try {
    // check repo exists and is a fork of Arslan-MD/Arslan_MD
    const repoRes = await axios.get(`https://api.github.com/repos/${username}/Arslan_MD`, {
      headers: { "User-Agent": "ARSLAN-MD-Deployer", Accept: "application/vnd.github.v3+json" },
      validateStatus: (s) => s === 200 || s === 404
    });
    if (repoRes.status !== 200) return { ok: false, reason: "repo_not_found" };

    const repo = repoRes.data;
    if (!repo.fork || repo.parent?.full_name !== "Arslan-MD/Arslan_MD") {
      return { ok: false, reason: "not_a_fork_of_official" };
    }

    // check package.json exists
    const contents = await axios.get(`https://api.github.com/repos/${username}/Arslan_MD/contents/package.json`, {
      headers: { Accept: "application/vnd.github.v3+json" },
      validateStatus: (s) => [200, 404].includes(s)
    });
    if (contents.status !== 200) return { ok: false, reason: "missing_package_json" };

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "github_error", detail: err.response?.data || err.message };
  }
}

// session id format check
function isValidSessionFormat(sid) {
  if (!sid) return false;
  sid = sid.trim();
  // accept either "ARSLAN-MD~..." or "(ARSLAN-MD~)..." per your server
  return (sid.startsWith("ARSLAN-MD~") || sid.startsWith("(ARSLAN-MD~)"));
}

// axios instance for VPS
const axiosVps = axios.create({
  baseURL: VPS_BASE,
  timeout: 30000,
  headers: { "Content-Type": "application/json" }
});

// ----------------- Command registration -----------------
// This uses cmd({ pattern, ... }, async (conn, m, { args }) => { ... })
// Adapt if your loader uses slightly different signature.

cmd({
  pattern: "vps",
  desc: "Deploy your Arslan-MD fork: .vps <github_username>",
  category: "tools",
  react: "💻",
  filename: __filename
}, async (conn, m, { args }) => {
  try {
    const chatId = m.chat || m.key.remoteJid;
    const username = (args && args[0]) ? String(args[0]).trim() : null;
    const prefix = (global?.config?.PREFIX) || ".";

    if (!username) return m.reply(`👉 Bhai username bhejo.\nUsage: ${prefix}vps <github_username>`);

    await m.reply(`🔎 Username \`${username}\` GitHub par check kar raha hoon... thoda intizaar karo.`);

    const ver = await verifyForkOnGitHub(username);
    if (!ver.ok) {
      // friendly messages for common reasons
      if (ver.reason === "repo_not_found") {
        return m.reply(`❌ Repo nahi mila. Ensure you forked https://github.com/Arslan-MD/Arslan_MD and your username is correct.`);
      }
      if (ver.reason === "not_a_fork_of_official") {
        return m.reply(`❌ Ye repo official Arslan_MD ka fork nahi lagta. Fork karo: https://github.com/Arslan-MD/Arslan_MD/fork`);
      }
      if (ver.reason === "missing_package_json") {
        return m.reply(`❌ Aapki fork me package.json nahi mil raha. Ensure repository structure sahi hai.`);
      }
      // other errors
      return m.reply(`❌ Verification failed: ${ver.detail?.message || ver.reason || "Unknown error"}`);
    }

    // save pending flow for this chat
    const state = loadState();
    state.flows[chatId] = { username, status: "waiting_session", createdAt: new Date().toISOString() };
    saveState(state);

    await m.reply(
      `✅ Username verified. Ab apna SESSION ID bhejo is format me:\n\n` +
      `${prefix}session ARSLAN-MD~xxxxxxxxxxxx\n\n` +
      `Jaise hi aap session bhejenge, main automatic deploy kar dunga.`
    );

  } catch (err) {
    console.error("vps cmd error:", err);
    try { await conn.sendMessage(OWNER_NUMBER.includes("@") ? OWNER_NUMBER : OWNER_NUMBER + "@s.whatsapp.net", { text: `VPS plugin error: ${err.stack || err.message}` }); } catch(e){}
    return m.reply("⚠️ Server error. Owner ko notify kar diya gaya hai.");
  }
});

// --------------------------------------------------------
// Session command — user sends .session ARSLAN-MD~...
cmd({
  pattern: "session",
  desc: "Provide your session ID: .session ARSLAN-MD~...",
  category: "tools",
  react: "🔑",
  filename: __filename
}, async (conn, m, { args }) => {
  try {
    const chatId = m.chat || m.key.remoteJid;
    const prefix = (global?.config?.PREFIX) || ".";
    const sessionId = (args && args[0]) ? String(args[0]).trim() : null;

    if (!sessionId) return m.reply(`❌ Session ID chahiye.\nUsage: ${prefix}session ARSLAN-MD~xxxxxxxx`);

    if (!isValidSessionFormat(sessionId)) {
      return m.reply(`❌ Invalid session format. Session ID should start with \`ARSLAN-MD~\`.\nExample: ${prefix}session ARSLAN-MD~xxxxxxxx`);
    }

    const state = loadState();
    const flow = state.flows[chatId];
    if (!flow || flow.status !== "waiting_session") {
      return m.reply(`⚠️ Koi pending deploy request nahi mila. Pehle ${prefix}vps <github_username> chalayein.`);
    }

    // call VPS deploy endpoint
    await m.reply("⏳ Session mil gaya — ab VPS pe deploy start kar raha hoon. Thoda intizaar karo...");

    let res;
    try {
      res = await axiosVps.post(DEPLOY_PATH, {
        github_username: flow.username,
        session_id: sessionId
      });
    } catch (err) {
      const serverData = err?.response?.data;
      if (serverData) {
        // forward backend error message
        await m.reply(`❌ Deploy failed: ${serverData.error || serverData.message || JSON.stringify(serverData)}`);
        // notify owner too
        try { await conn.sendMessage(OWNER_NUMBER.includes("@") ? OWNER_NUMBER : OWNER_NUMBER + "@s.whatsapp.net", { text: `Deploy failed for ${flow.username}: ${JSON.stringify(serverData)}` }); } catch(e){}
      } else {
        await m.reply(`❌ Deploy request failed (network). Error: ${err.message || String(err)}`);
        try { await conn.sendMessage(OWNER_NUMBER.includes("@") ? OWNER_NUMBER : OWNER_NUMBER + "@s.whatsapp.net", { text: `Deploy network error for ${flow.username}: ${err.message || String(err)}` }); } catch(e){}
      }
      // clear pending
      delete state.flows[chatId];
      saveState(state);
      return;
    }

    const dr = res?.data || {};
    if (!dr || (!dr.success && !dr.ok)) {
      // backend responded but with error payload
      await m.reply(`❌ Deployment failed: ${dr.error || dr.message || JSON.stringify(dr)}`);
      try { await conn.sendMessage(OWNER_NUMBER.includes("@") ? OWNER_NUMBER : OWNER_NUMBER + "@s.whatsapp.net", { text: `Deploy failed for ${flow.username}: ${JSON.stringify(dr)}` }); } catch(e){}
      delete state.flows[chatId];
      saveState(state);
      return;
    }

    // success — server sends app url + name
    const appUrl = dr.url || dr.appUrl || dr.app_name || dr.appName || `https://${dr.appName || dr.app_name}.herokuapp.com`;
    const appName = dr.appName || dr.app_name || dr.appName || dr.appname || "n/a";

    await m.reply(`✅ Deployment started!\nApp: ${appName}\nURL: ${appUrl}\n\nOwner ko notify kar diya gaya hai.`);

    try { await conn.sendMessage(OWNER_NUMBER.includes("@") ? OWNER_NUMBER : OWNER_NUMBER + "@s.whatsapp.net", { text: `User ${flow.username} started deploy. App: ${appName}, URL: ${appUrl}` }); } catch(e){}

    // clear pending
    delete state.flows[chatId];
    saveState(state);

  } catch (err) {
    console.error("session cmd error:", err);
    try { await conn.sendMessage(OWNER_NUMBER.includes("@") ? OWNER_NUMBER : OWNER_NUMBER + "@s.whatsapp.net", { text: `VPS session handler error: ${err.stack || err.message}` }); } catch(e){}
    return m.reply("⚠️ Internal error. Owner ko notify kar diya gaya hai.");
  }
});
