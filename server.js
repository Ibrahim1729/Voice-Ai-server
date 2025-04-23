const WebSocket = require("ws");
const { createClient } = require("@deepgram/sdk");
const fetch = require("node-fetch");
const fs = require("fs");
const https = require("https");
const path = require("path");
const { Readable } = require("stream");
const { exec } = require("child_process");
require("dotenv").config();

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const prompts = JSON.parse(fs.readFileSync("./prompts.json", "utf8"));
const callerMemory = JSON.parse(fs.readFileSync("./callerMemory.json", "utf8"));

// Ensure voices.json exists and is correctly formatted
let voices;
try {
  voices = JSON.parse(fs.readFileSync("./voices.json", "utf8"));
  if (!voices.default) throw new Error("Missing default voice in voices.json");
} catch (error) {
  console.error("❌ voices.json is missing or malformed:", error.message);
  process.exit(1);
}

const wss = new WebSocket.Server({ port: process.env.PORT || 3000 });

wss.on("connection", (ws, req) => {
  console.log("🔗 Client connected");
  const callerId = req.headers["x-caller-id"] || `caller_${Date.now()}`;

  const dgStream = deepgram.listen.live({
    model: "nova",
    smart_format: true,
    interim_results: false
  });

  dgStream.on("open", () => console.log("🔊 Deepgram socket opened"));
  dgStream.on("error", (err) => console.error("❌ Deepgram error:", err));

  dgStream.on("transcriptReceived", async (data) => {
    const transcript = data.channel.alternatives[0].transcript;
    if (!transcript) return;
    console.log("🗣️ User:", transcript);

    const memory = callerMemory[callerId] || [];
    memory.push(transcript);

    const promptConfig = prompts[prompts.defaultKey] || prompts;
    const systemPrompt = promptConfig.system || "You are a helpful assistant.";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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

    const result = await response.json();
    const reply = result.choices?.[0]?.message?.content;
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
    console.log("🔊 TTS Audio URL:", mp3Url);

    // Download MP3 and convert to raw PCM (mulaw) for Twilio
    const audioPath = path.join(__dirname, "temp.mp3");
    const rawPath = path.join(__dirname, "temp.raw");

    const file = fs.createWriteStream(audioPath);
    https.get(mp3Url, (response) => {
      response.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          const ffmpegCmd = `ffmpeg -y -i ${audioPath} -f mulaw -ar 8000 -ac 1 ${rawPath}`;
          exec(ffmpegCmd, (err) => {
            if (err) return console.error("FFmpeg error:", err);
            const audioBuffer = fs.readFileSync(rawPath);

            // Send audio back to Twilio in media message chunks
            const chunkSize = 320;
            for (let i = 0; i < audioBuffer.length; i += chunkSize) {
              const chunk = audioBuffer.slice(i, i + chunkSize);
              const base64Chunk = chunk.toString("base64");
              ws.send(JSON.stringify({ event: "media", media: { payload: base64Chunk } }));
            }

            ws.send(JSON.stringify({ event: "mark", mark: { name: "done" } }));
            console.log("✅ Audio streamed back to Twilio.");
          });
        });
      });
    });
  });

  ws.on("message", (msg) => dgStream.send(msg));

  ws.on("close", () => {
    dgStream.finish();
    console.log("❌ WebSocket closed");
  });
});

