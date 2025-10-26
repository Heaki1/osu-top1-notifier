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

// Load previous data
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
      scope: "public"
    })

  });
  const data = await res.json();
  accessToken = data.access_token;
}

const res = await fetch("https://osu.ppy.sh/api/v2/beatmapsets/search?mode=osu&sort=ranked_desc&limit=20", {
  headers: { Authorization: `Bearer ${accessToken}` }
});


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

app.listen(PORT, () => console.log(`✅ Listening for cron pings on port ${PORT}`));
