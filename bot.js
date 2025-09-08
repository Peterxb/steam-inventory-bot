import { Client, GatewayIntentBits } from "discord.js";
import fetch from "node-fetch";

// Load secrets from environment variables (Render sets these in the dashboard)
const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const STEAMID64 = process.env.STEAMID64;
const APPID = process.env.APPID || 730;     // default CS2
const CONTEXTID = process.env.CONTEXTID || 2;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

let lastItems = [];

// Fetch inventory with proper User-Agent to avoid Steam blocking
async function fetchInventory() {
  const url = `https://steamcommunity.com/inventory/${STEAMID64}/${APPID}/${CONTEXTID}?l=english&count=5000`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; InventoryBot/1.0)" }
    });
    if (!res.ok) {
      console.log("HTTP Error:", res.status);
      return null;
    }
    const data = await res.json();
    console.log("Fetched items count:", data.descriptions?.length || 0);
    return data.descriptions?.map(item => item.market_hash_name) || [];
  } catch (err) {
    console.log("Fetch failed:", err);
    return null;
  }
}

// Check for inventory changes and post to Discord
async function checkChanges() {
  const items = await fetchInventory();
  if (!items) return;

  if (lastItems.length > 0) {
    const added = items.filter(x => !lastItems.includes(x));
    const removed = lastItems.filter(x => !items.includes(x));

    if (added.length || removed.length) {
      const channel = await client.channels.fetch(CHANNEL_ID);
      let msg = "⚡ Inventory change detected:\n";
      if (added.length) msg += `🟢 Added: ${added.join(", ")}\n`;
      if (removed.length) msg += `🔴 Removed: ${removed.join(", ")}\n`;
      channel.send(msg);
    }
  }

  lastItems = items;
}

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // 🔹 Immediate test fetch
  const testItems = await fetchInventory();
  if (testItems) {
    console.log("Fetched inventory (first 5 items):", testItems.slice(0, 5));
  } else {
    console.log("Failed to fetch inventory for test.");
  }

  // Start regular interval for checking changes
  setInterval(checkChanges, 60 * 1000); // every 60s
});

client.login(TOKEN);
