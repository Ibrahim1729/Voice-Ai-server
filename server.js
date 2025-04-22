const WebSocket = require("ws");
const { createClient } = require("@deepgram/sdk");
const fetch = require("node-fetch");
const fs = require("fs");

// Initialize Deepgram
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// Load prompts and memory
const prompts = JSON.parse(fs.readFileSync("./prompts.json", "utf8"));
const callerMemory = JSON.parse(fs.readFileSync("./callerMemory.json", "utf8"));

// WebSocket Server
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

wss.on("connection", (ws, req) => {
  console.log("🔗 Client connected");

  const callerId = req.headers["x-caller-id"] || `caller_${Date.now()}`;

  const dgStream = deepgram.listen.live({
    model: "nova",
    smart_format: true,
    interim_results: false
  });

  dgStream.on("open", () => {
    console.log("🧠 Deepgram stream opened");
  });

  dgStream.on("error", (err) => {
    console.error("❌ Deepgram error:", err);
  });

  dgStream.on("transcriptReceived", async (data) => {
    const transcript = data.channel.alternatives[0]?.transcript;
    if (!transcript) return;

    console.log("🗣️ User:", transcript);

    const context = callerMemory[callerId]?.history || [];
    context.push({ role: "user", content: transcript });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [...(prompts.system ? [{ role: "system", content: prompts.system }] : []), ...context]
      })
    });

    const result = await response.json();
    const reply = result.choices?.[0]?.message?.content;
    console.log("🤖 GPT:", reply);

    // Update memory
    callerMemory[callerId] = callerMemory[callerId] || { history: [] };
    callerMemory[callerId].history.push({ role: "assistant", content: reply });

    fs.writeFileSync("./callerMemory.json", JSON.stringify(callerMemory, null, 2));
  });

  ws.on("message", (msg) => {
    dgStream.send(msg);
  });

  ws.on("close", () => {
    dgStream.finish();
    console.log("❌ WebSocket closed");
  });
});
