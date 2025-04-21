const WebSocket = require("ws");
const { Deepgram } = require("@deepgram/sdk");
const fetch = require("node-fetch");

const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

wss.on("connection", (ws) => {
  console.log("🔗 Client connected");

  const dgLive = deepgram.transcription.live({ punctuate: true });

  dgLive.on("transcriptReceived", async (data) => {
    const transcript = JSON.parse(data).channel.alternatives[0].transcript;
    if (transcript) {
      console.log("🗣️ User:", transcript);

      const gptReply = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [{ role: "user", content: transcript }]
        }),
      });

      const result = await gptReply.json();
      const reply = result.choices?.[0]?.message?.content;
      console.log("🤖 GPT:", reply);
    }
  });

  ws.on("message", (msg) => {
    dgLive.send(msg);
  });

  ws.on("close", () => {
    dgLive.finish();
    console.log("❌ Connection closed");
  });
});
