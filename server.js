const WebSocket = require("ws");
const { createClient } = require("@deepgram/sdk");
const fetch = require("node-fetch");
const fs = require("fs");
require("dotenv").config();

// Initialize Deepgram
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// Load prompts, memory, and voice configurations
const prompts = JSON.parse(fs.readFileSync("./prompts.json", "utf8"));
const callerMemory = JSON.parse(fs.readFileSync("./callerMemory.json", "utf8"));
const voices = JSON.parse(fs.readFileSync("./voices.json", "utf8"));

// WebSocket server
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

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
    console.log("🔊 TTS Audio URL:", ttsData.audioUrl);
  });

  ws.on("message", (msg) => dgStream.send(msg));

  ws.on("close", () => {
    dgStream.finish();
    console.log("❌ WebSocket closed");
  });
});
