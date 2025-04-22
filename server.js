const WebSocket = require("ws");
const { createClient } = require("@deepgram/sdk");
const fetch = require("node-fetch");
const fs = require("fs");

// Initialize Deepgram
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// Load prompts
const prompts = JSON.parse(fs.readFileSync("./prompts.json", "utf8"));
const callerMemory = JSON.parse(fs.readFileSync("./callerMemory.json", "utf8"));

// WebSocket server
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

wss.on("connection", (ws, req) => {
  console.log("🔗 Client connected");

  // Extract caller ID from headers if available
  const callerId = req.headers["x-caller-id"] || `caller_${Date.now()}`;

  const dgStream = deepgram.listen.live({
    model: "nova",
    smart_format: true,
    interim_results: false,
  });

  dgStream.on("open", () => {
    console.log("🔊 Deepgram socket opened");
  });

  dgStream.on("error", (err) => {
    console.error("❌ Deepgram error:", err);
  });

  dgStream.on("transcriptReceived", async (data) => {
    const transcript = data.channel.alternatives[0]?.transcript;
    if (!transcript) return;

    console.log("🗣️ User:", transcript);

    // Load memory for caller
    const memory = callerMemory[callerId] || [];

    // Append transcript to memory
    memory.push({ role: "user", content: transcript });

    // Add system prompt
    const messages = [
      { role: "system", content: prompts.default || "You are a helpful assistant." },
      ...memory,
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages,
      }),
    });

    const result = await response.json();
    const reply = result.choices?.[0]?.message?.content;
    if (!reply) return;

    console.log("🤖 GPT:", reply);

    // Save AI reply to memory
    memory.push({ role: "assistant", content: reply });

    // Save memory back to file
    callerMemory[callerId] = memory;
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
