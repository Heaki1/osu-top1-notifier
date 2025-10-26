import express from "express";
import fetch from "node-fetch";

const app = express();

const OSU_CLIENT_ID = process.env.OSU_CLIENT_ID;
const OSU_CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

let lastTop = [];

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
  return data.access_token;
}

async function getAlgerianTop(token) {
  const res = await fetch("https://osu.ppy.sh/api/v2/rankings/osu/performance?country=DZ", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.ranking.map(p => p.user.id);
}

async function notifyDiscord(message) {
  await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message })
  });
}

app.get("/check", async (req, res) => {
  try {
    const token = await getToken();
    const topNow = await getAlgerianTop(token);

    if (lastTop.length === 0) {
      lastTop = topNow;
      return res.send("First check — saved leaderboard, no notifications.");
    }

    // check for new #1s
    const newOnes = topNow.filter(id => !lastTop.includes(id));
    if (newOnes.length > 0) {
      await notifyDiscord(`🎉 New Algerian #1(s): ${newOnes.join(", ")}`);
    }

    lastTop = topNow;
    res.send("Checked and updated.");
  } catch (e) {
    console.error(e);
    res.status(500).send("Error checking leaderboard.");
  }
});

app.listen(3000, () => console.log("Listening on port 3000"));
