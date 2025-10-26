import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";
import express from "express";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const OSU_CLIENT_ID = process.env.OSU_CLIENT_ID;
const OSU_CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const LAST_FILE = "./lastScores.json";

let accessToken = "";
let lastScores = {};
let firstRun = true;

// Load saved data
if (fs.existsSync(LAST_FILE)) {
  lastScores = JSON.parse(fs.readFileSync(LAST_FILE, "utf8"));
}

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

// Get osu! API token
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

// Get recently ranked beatmaps
async function getRecentRankedBeatmaps(limit = 50) {
  const res = await fetch(`https://osu.ppy.sh/api/v2/beatmapsets/search?mode=osu&sort=ranked_desc&limit=${limit}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return data.beatmapsets?.flatMap(set => set.beatmaps.map(b => ({
    id: b.id,
    title: set.title,
    artist: set.artist,
    difficulty: b.version,
    cover: set.covers.cover
  }))) || [];
}

// Get Algerian #1 for a beatmap
async function getAlgerianTop1(beatmapId) {
  const res = await fetch(`https://osu.ppy.sh/api/v2/beatmaps/${beatmapId}/scores?type=country&mode=osu&country=DZ`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return data.scores?.[0]; // top score
}

// Send Discord notification
async function notifyDiscord(player, beatmap) {
  const embed = {
    title: `🇩🇿 ${player.user.username} took #1 on ${beatmap.title} [${beatmap.difficulty}]!`,
    url: `https://osu.ppy.sh/b/${beatmap.id}`,
    color: 0x00ff99,
    thumbnail: { url: beatmap.cover },
    footer: { text: `New Algerian #1` },
  };

  await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });

  log(`✅ Notified: ${player.user.username} - ${beatmap.title}`);
}

// Core check logic
async function checkNewTop1s() {
  const beatmaps = await getRecentRankedBeatmaps();

  for (const beatmap of beatmaps) {
    const topScore = await getAlgerianTop1(beatmap.id);
    if (!topScore) continue;

    const previousTop = lastScores[beatmap.id];
    const currentTopId = topScore.user.id;

    if (firstRun) {
      lastScores[beatmap.id] = currentTopId;
      continue;
    }

    if (previousTop && previousTop !== currentTopId) {
      await notifyDiscord(topScore, beatmap);
    }

    lastScores[beatmap.id] = currentTopId;
  }

  fs.writeFileSync(LAST_FILE, JSON.stringify(lastScores, null, 2));
  firstRun = false;
  log("✅ Check completed successfully");
}

// Express route for cron-job.org
app.get("/run-check", async (req, res) => {
  try {
    log("⏱️ Cron triggered - checking new Algerian #1s...");
    await getToken();
    await checkNewTop1s();
    res.send("✅ osu! Algeria #1 check completed");
  } catch (err) {
    console.error("❌ Cron error:", err);
    res.status(500).send("Error during check");
  }
});

app.listen(PORT, () => log(`✅ Listening for cron pings on port ${PORT}`));
