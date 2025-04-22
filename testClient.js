const WebSocket = require("ws");

const socket = new WebSocket("wss://voice-ai-server.onrender.com");

socket.on("open", () => {
  console.log("✅ Connected to AI server");

  // Simulate voice data (this would be a Deepgram-style binary chunk)
  const fakeTranscript = JSON.stringify({
    channel: {
      alternatives: [{ transcript: "I want to book a room for 2 nights starting Friday" }]
    }
  });

  socket.send(fakeTranscript);
});

socket.on("close", () => {
  console.log("❌ Connection closed");
});

socket.on("error", (err) => {
  console.error("❌ WebSocket Error:", err.message);
});
