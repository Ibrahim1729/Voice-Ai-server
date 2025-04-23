console.log("🔥 Booting app...");
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

// ✅ Load voices.json safely
let voices;
try {
  voices = JSON.parse(fs.readFileSync("./voices.json", "utf8"));
  if (!voices.default) throw new Error("Missing default voice in voices.json");
} catch (err) {
  console.error("❌ voices.json missing or malformed:", err.message);
  process.exit(1);
}

// ✅ Start WebSocket server
const wss = new WebSocket.Server({
  port: process.env.PORT || 8080,
  host: "0.0.0.0"
});
console.log(`🟢 WebSocket server listening on ${process.env.PORT || 8080}`);

wss.on("connection", (ws, req) => {
  console.log("🔗 Client connected");
  const callerId = req.headers["x-caller-id"] || `caller_${Date.now()}`;

  const dgStream = deepgram.listen.live({
    model: "nova",
    smart_format: true,
    interim_results: false
  });

  dgStream.on("open", () => console.log("🔊 Deepgram stream opened"));
  dgStream.on("error", (err) => console.error("❌ Deepgram error:", err));

  dgStream.on("transcriptReceived", async (data) => {
    const transcript = data.channel.alternatives[0].transcript;
    if (!transcript) return;
    console.log("🗣️ Caller said:", transcript);

    const memory = callerMemory[callerId] || [];
    memory.push(transcript);

    const promptConfig = prompts[prompts.defaultKey] || prompts;
    const systemPrompt = promptConfig.system || "You are a helpful assistant.";

    try {
      const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [
            { role: "system", content: systemPrompt },
            ...memory.map((m) => ({ role: "user", content: m }))
          ]
        })
      });

      const aiJson = await aiRes.json();
      const reply = aiJson.choices?.[0]?.message?.content;
      console.log("🤖 GPT:", reply);

      callerMemory[callerId] = memory;
      fs.writeFileSync("./callerMemory.json", JSON.stringify(callerMemory, null, 2));

      const selectedVoice = promptConfig.voice || voices.default;

      const ttsRes = await fetch("https://api.play.ht/api/v2/tts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PLAYHT_API_KEY}`,
          "X-User-Id": process.env.PLAYHT_USER_ID,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          voice: selectedVoice,
          output_format: "mp3",
          text: reply
        })
      });

      const ttsData = await ttsRes.json();
      const mp3Url = ttsData.audioUrl;
      console.log("🔊 TTS URL:", mp3Url);

      const audioPath = path.join(__dirname, "temp.mp3");
      const rawPath = path.join(__dirname, "temp.raw");

      const file = fs.createWriteStream(audioPath);
      https.get(mp3Url, (response) => {
        response.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            const cmd = `ffmpeg -y -i ${audioPath} -f mulaw -ar 8000 -ac 1 ${rawPath}`;
            exec(cmd, (err) => {
              if (err) return console.error("❌ FFmpeg error:", err);
              const buffer = fs.readFileSync(rawPath);
              const chunkSize = 320;

              for (let i = 0; i < buffer.length; i += chunkSize) {
                const chunk = buffer.slice(i, i + chunkSize);
                ws.send(JSON.stringify({
                  event: "media",
                  media: { payload: chunk.toString("base64") }
                }));
              }

              ws.send(JSON.stringify({ event: "mark", mark: { name: "done" } }));
              console.log("✅ Audio streamed back.");
            });
          });
        });
      });

    } catch (e) {
      console.error("🛑 GPT or TTS error:", e);
    }
  });

  ws.on("message", (msg) => {
    try {
      dgStream.send(msg);
    } catch (err) {
      console.error("📡 Message error:", err.message);
    }
  });

  ws.on("close", () => {
    console.log("❌ WebSocket closed");
    dgStream.finish();
  });
});
