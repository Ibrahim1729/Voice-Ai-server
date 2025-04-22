const WebSocket = require("ws");
const { Deepgram } = require("@deepgram/sdk");
const fetch = require("node-fetch");

const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

wss.on("connection", (ws) => {
  console.log("🔗 Client connected");

  const dgStream = deepgram.listen.live({
    model: "nova",
    smart_format: true,
    interim_results: false
  });

  dgStream.on("open", () => {
    console.log("🔊 Deepgram socket opened");
  });

  dgStream.on("error", (err) => {
    console.error("❌ Deepgram error:", err);
  });

  dgStream.on("transcriptReceived", async (data) => {
    const transcript = data.channel.alternatives[0].transcript;
    if (transcript) {
      console.log("🗣️ User:", transcript);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [{ role: "user", content: transcript }]
        })
      });

      const result = await response.json();
      const reply =
