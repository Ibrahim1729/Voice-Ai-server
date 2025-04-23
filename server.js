require("dotenv").config();
console.log("🚀 App has started!");

const WebSocket = require("ws");
const { createClient } = require("@deepgram/sdk");
const fetch = require("node-fetch");
const fs = require("fs");
const https = require("https");
const path = require("path");
const { exec } = require("child_process");

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const prompts = JSON.parse(fs.readFileSync("./prompts.json", "utf8"));
const callerMemory = JSON.parse(fs.readFileSync("./callerMemory.json", "utf8"));

// ✅ Check voices.json
let voices;
try {
  voices = JSON.parse(fs.readFileSync("./voices.json", "utf8"));
  if (!voices.default) throw new Error("Missing default voice in voices.json");
} catch (error) {
  console.error("❌ voices.json is missing or malformed:", error.message);
  process.exit(1);
}

// ✅ WebSocket server listening on 0.0.0.0:8080
const wss = new WebSocket.Server({
  port: process.env.PORT || 8080,
  host: "0.0.0.0"
});

console.log(`🟢 WebSocket server listening on ${process.env.PORT || 8080}`);

wss.on("connection", (ws, req) => {
  console.log("🔗 Client
