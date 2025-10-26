import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const OSU_CLIENT_ID = process.env.OSU_CLIENT_ID;
const OSU_CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const LAST_FILE = "./lastScores.json";

let accessToken = "";
let lastScores = [];
let firstRun = true;

// Load lastScores from file
if (fs.existsSync(LAST_FILE)) {
  lastScores = JSON.parse(fs.readFileSync(LAST_FILE, "utf8"));
}

async function getToken() {
  const res = await fetch("https://osu.ppy.sh/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: OSU_CLIENT_ID,
      client_secret: OSU_CLIENT_SECRET,
      grant_type: "client_credentials",
      scope: "public"
    })
  });
  const data = await res.json();
  accessToken = data.access_token;
}

async function getAlgerianTopPlayers() {
  const res = await fetch("https://osu.ppy.sh/api/v2/rankings/osu/performance?country=DZ", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return data.ranking || [];
}

async function getUserBestPlay(userId) {
  const res = await fetch(`https://osu.ppy.sh/api/v2/users/${userId}/scores/best?limit=1`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const data = await res.json();
  if (!data[0]) return null;

  return data[0]; // the top #1 score
}

async function notifyDiscord(player, beatmap) {
  const pp = player.pp ? player.pp.toFixed(2) : "N/A";
  const rank = player.global_rank ? `#${player.global_rank}` : "Unknown";

  const embed = {
    title: `${player.username} got #1 on ${beatmap.beatmapset.title} [${beatmap.version}]!`,
    url: `https://osu.ppy.sh/b/${beatmap.id}`,
    color: 0xff66aa,
    thumbnail: { url: beatmap.beatmapset.covers.cover },
    footer: { text: `PP: ${pp} | Rank: ${rank}` },
  };

  await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });

  console.log(`✅ Notified for ${player.username} (${beatmap.beatmapset.title})`);
}

async function checkNewTop1s() {
  const players = await getAlgerianTopPlayers();

  if (firstRun) {
    console.log("Skipping notifications on first run to avoid spam...");
    firstRun = false;
    lastScores = players.map(p => p.user.id);
    fs.writeFileSync(LAST_FILE, JSON.stringify(lastScores, null, 2));
    return;
  }

  for (const player of players) {
    if (!lastScores.includes(player.user.id)) {
      const beatmap = await getUserBestPlay(player.user.id);
      if (beatmap) await notifyDiscord(player.user, beatmap);
    }
  }

  lastScores = players.map(p => p.user.id);
  fs.writeFileSync(LAST_FILE, JSON.stringify(lastScores, null, 2));
}

// ================================
// Express app (for cron-job.org)
// ================================
const app = express();

app.get("/run-check", async (req, res) => {
  try {
    console.log("⏱️ Cron triggered - checking new top 1s...");
    await getToken();
    await checkNewTop1s();
    res.send("✅ osu! Top1 check completed");
  } catch (err) {
    console.error("❌ Cron error:", err);
    res.status(500).send("Error during check");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Listening for cron pings on port ${PORT}`));

// ================================
// Auto-run loop (every 10 minutes)
// ================================
(async () => {
  console.log("🚀 Starting osu! Algeria Top1 Notifier...");
  await getToken();
  await checkNewTop1s();

  setInterval(async () => {
    await getToken(); // refresh token
    await checkNewTop1s();
  }, 10 * 60 * 1000); // every 10 minutes
})();
