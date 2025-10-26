import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";
import express from "express";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

const OSU_CLIENT_ID = process.env.OSU_CLIENT_ID;
const OSU_CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const LAST_FILE = "./lastScores.json";

let accessToken = "";
let lastScores = {};
let firstRun = true;

// Load last saved scores
if (fs.existsSync(LAST_FILE)) {
  lastScores = JSON.parse(fs.readFileSync(LAST_FILE, "utf8"));
}

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

// === AUTH ===
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
  log("🔑 Token refreshed");
}

// === FETCH ALGERIAN TOP PLAYERS ===
async function getAlgerianTopPlayers() {
  const res = await fetch(
    "https://osu.ppy.sh/api/v2/rankings/osu/performance?country=DZ&cursor=&limit=50",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  return data.ranking || [];
}

// === FETCH USER'S TOP PLAY ===
async function getUserBestPlay(userId) {
  const res = await fetch(`https://osu.ppy.sh/api/v2/users/${userId}/scores/best?limit=1`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return data[0]; // top 1 play
}

// === SEND DISCORD NOTIFICATION ===
async function notifyDiscord(user, beatmap) {
  const embed = {
    username: "osu! Algeria Top1 Notifier",
    embeds: [
      {
        title: `${user.username} just achieved #1 in Algeria! 🇩🇿`,
        description: `[${beatmap.beatmapset.title} [${beatmap.beatmap.version}]](https://osu.ppy.sh/beatmaps/${beatmap.beatmap.id})`,
        thumbnail: { url: beatmap.beatmapset.covers.card },
        fields: [
          { name: "PP", value: `${Math.round(beatmap.pp)}pp`, inline: true },
          { name: "Accuracy", value: `${(beatmap.accuracy * 100).toFixed(2)}%`, inline: true },
        ],
        color: 0xff66aa,
      }
    ]
  };

  await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(embed)
  });

  log(`🎉 Sent Discord notification for ${user.username}`);
}

// === MAIN CHECK FUNCTION ===
async function checkNewTop1s() {
  const players = await getAlgerianTopPlayers();

  if (firstRun) {
    log("Skipping notifications on first run to avoid spam...");
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
  log("✅ Check completed successfully");
}

// === EXPRESS ENDPOINT ===
app.get("/run-check", async (req, res) => {
  try {
    log("⏱️ Cron triggered - checking new top 1s...");
    await getToken();
    await checkNewTop1s();
    res.send("✅ osu! Top1 check completed");
  } catch (err) {
    console.error("❌ Cron error:", err);
    res.status(500).send("Error during check");
  }
});

app.listen(PORT, () => log(`✅ Listening for cron pings on port ${PORT}`));
