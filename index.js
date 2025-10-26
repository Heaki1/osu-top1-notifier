import fetch from "node-fetch";
import fs from "fs";
import express from "express";
import dotenv from "dotenv";

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

// Load saved data
if (fs.existsSync(LAST_FILE)) {
  lastScores = JSON.parse(fs.readFileSync(LAST_FILE, "utf8"));
}

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

async function getToken() {
  const res = await fetch("https://osu.ppy.sh/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: OSU_CLIENT_ID,
      client_secret: OSU_CLIENT_SECRET,
      grant_type: "client_credentials",
      scope: "public",
    }),
  });

  const data = await res.json();
  accessToken = data.access_token;
  log("🔑 Token refreshed");
}

async function getRecentRankedBeatmaps() {
  const res = await fetch(
    "https://osu.ppy.sh/api/v2/beatmapsets/search?mode=osu&sort=ranked_desc&limit=50",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  return data.beatmapsets
    .flatMap(set => set.beatmaps)
    .filter(b => b.status === "ranked");
}

async function getTop1ForBeatmap(beatmapId) {
  const res = await fetch(
    `https://osu.ppy.sh/api/v2/beatmaps/${beatmapId}/scores?country=DZ`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  return data.scores?.[0];
}

async function sendDiscordNotification(beatmap, top1) {
  const embed = {
    title: `🇩🇿 New #1 on ${beatmap.version}`,
    url: `https://osu.ppy.sh/b/${beatmap.id}`,
    color: 0x1abc9c,
    author: {
      name: top1.user.username,
      url: `https://osu.ppy.sh/users/${top1.user.id}`,
      icon_url: top1.user.avatar_url,
    },
    thumbnail: { url: beatmap.beatmapset.covers.card },
    fields: [
      {
        name: "Beatmap",
        value: `${beatmap.beatmapset.artist} - ${beatmap.beatmapset.title}`,
      },
      { name: "Score", value: top1.score.toLocaleString(), inline: true },
      { name: "PP", value: `${Math.round(top1.pp)}pp`, inline: true },
      { name: "Accuracy", value: `${(top1.accuracy * 100).toFixed(2)}%`, inline: true },
    ],
    timestamp: new Date(),
  };

  await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });

  log(`🎉 Sent Discord notification for ${top1.user.username} on ${beatmap.id}`);
}

async function checkNewTop1s() {
  const beatmaps = await getRecentRankedBeatmaps();

  for (const beatmap of beatmaps) {
    const top1 = await getTop1ForBeatmap(beatmap.id);
    if (!top1) continue;

    const previous = lastScores[beatmap.id];
    if (previous && previous.user_id === top1.user.id) continue;

    if (!firstRun && previous && previous.user_id !== top1.user.id) {
      await sendDiscordNotification(beatmap, top1);
    }

    lastScores[beatmap.id] = { user_id: top1.user.id, username: top1.user.username };
  }

  fs.writeFileSync(LAST_FILE, JSON.stringify(lastScores, null, 2));
  firstRun = false;
  log("✅ Check completed successfully");
}

// Route for cron-job.org
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
