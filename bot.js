import { Client, GatewayIntentBits } from "discord.js";
import fetch from "node-fetch";
import express from "express";

// ------------------------------------
// 1. CONFIGURATION AND SECRETS
// ------------------------------------

// Load secrets from environment variables
const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
// Load MULTIPLE Steam IDs from a comma-separated list
const STEAM_IDS = (process.env.STEAM_IDS || "").split(',')
  .map(id => id.trim())
  .filter(Boolean); // Clean up and ensure we have at least one ID

const APPID = process.env.APPID || 730;      // default CS2
const CONTEXTID = process.env.CONTEXTID || 2;

if (STEAM_IDS.length === 0) {
  console.error("FATAL: No Steam IDs found in the STEAM_IDS environment variable. Please set it.");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Use an object to store the last inventory (state) for EACH Steam ID
let lastInventories = {}; // { 'steamid1': [...items], 'steamid2': [...items], ... }

// ------------------------------------
// 2. HELPER FUNCTIONS
// ------------------------------------

// Fetch inventory for a specific Steam ID
async function fetchInventory(steamId) {
  const url = `https://steamcommunity.com/inventory/${steamId}/${APPID}/${CONTEXTID}?l=english&count=500`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; InventoryBot/1.0)" }
    });
    if (!res.ok) {
      console.log(`HTTP Error for ${steamId}:`, res.status);
      return null;
    }
    const data = await res.json();
    if (!data.assets || !data.descriptions) return [];

    // Map each asset to its market_hash_name
    const items = data.assets.map(asset => {
      const desc = data.descriptions.find(
        d => d.classid === asset.classid && d.instanceid === asset.instanceid
      );
      return desc ? desc.market_hash_name : null;
    }).filter(Boolean);

    console.log(`Fetched items count for ${steamId}: ${items.length}`);
    return items;
  } catch (err) {
    console.log(`Fetch failed for ${steamId}:`, err);
    return null;
  }
}

// Compare old vs new inventory counts
function diffInventories(oldItems, newItems) {
  const added = [];
  const removed = [];

  const oldCounts = oldItems.reduce((acc, name) => {
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});

  const newCounts = newItems.reduce((acc, name) => {
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});

  const allNames = new Set([...Object.keys(oldCounts), ...Object.keys(newCounts)]);

  allNames.forEach(name => {
    const oldCount = oldCounts[name] || 0;
    const newCount = newCounts[name] || 0;
    if (newCount > oldCount) added.push(`${name} x${newCount - oldCount}`);
    if (oldCount > newCount) removed.push(`${name} x${oldCount - newCount}`);
  });

  return { added, removed };
}

// ------------------------------------
// 3. MAIN CHECKER LOGIC
// ------------------------------------

// Iterate through all Steam IDs and check for inventory changes
async function checkChanges() {
  console.log(`Starting inventory check for ${STEAM_IDS.length} IDs...`);

  for (const steamId of STEAM_IDS) {
    const newItems = await fetchInventory(steamId);
    if (!newItems) {
      console.log(`Inventory fetch failed for ${steamId}, skipping this interval.`);
      continue;
    }

    const lastItems = lastInventories[steamId]; // Get the last known state for THIS ID

    // Only compare if we have a previous state AND it's not the first run
    if (lastItems && lastItems.length > 0) {
      const { added, removed } = diffInventories(lastItems, newItems);

      if (added.length || removed.length) {
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (channel?.isTextBased?.()) {
          // You can modify the mention and message as needed
          let msg = `<@677917996450054170> ⚡ Inventory change detected for **STEAM ID: ${steamId}**:\n`;
          if (added.length) msg += `🟢 Added: ${added.join(", ")}\n`;
          if (removed.length) msg += `🔴 Removed: ${removed.join(", ")}\n`;
          
          channel.send(msg);
        } else {
          console.log(`Cannot send message for ${steamId}, channel not found or not text-based.`);
        }
      }
    }

    // Update the state for the current Steam ID
    lastInventories[steamId] = newItems;
  }
  console.log("All inventory checks complete.");
}

// ------------------------------------
// 4. DISCORD CLIENT AND BOOTSTRAP
// ------------------------------------

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // 🔹 Initial check and setup for all IDs
  console.log("Performing initial inventory fetch for all IDs...");
  for (const steamId of STEAM_IDS) {
    const testItems = await fetchInventory(steamId);
    if (testItems) {
      lastInventories[steamId] = testItems;
    } else {
      console.log(`Failed initial fetch for ${steamId}. Will try again later.`);
    }
  }

  const testChannel = await client.channels.fetch(CHANNEL_ID);
  if (testChannel?.isTextBased?.()) {
    testChannel.send(`✅ Bot is online and ready to post inventory changes for **${STEAM_IDS.length}** IDs!`);
  }

  // Start regular interval for checking changes
  setInterval(checkChanges, 60 * 1000); // every 60s
});

client.login(TOKEN);

// ------------------------------------
// 5. EXPRESS WEB SERVER (for UptimeRobot)
// ------------------------------------

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("✅ Bot is alive!");
});

app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));
