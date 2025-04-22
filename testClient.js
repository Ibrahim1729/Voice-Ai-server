const WebSocket = require("ws");

const socket = new WebSocket("wss://voice-ai-server.onrender.com");

socket.on("open", () => {
  console.log("✅ Connected to AI server");

  // Simulated voice message with fake caller ID
  const fakeTranscript = JSON.stringify({
    caller: "+1234567890", // Simulated caller number (used for memory)
    channel: {
      alternatives: [
        {
          transcript: "I want to book a room for 2 nights starting Friday"
        }
      ]
    }
  });

  // Send the fake message to server
  socket.send(fakeTranscript);
});

socket.on("message", (data) => {
  console.log("🤖 Server replied:", data.toString());
});

socket.on("close", () => {
  console.log("❌ Connection closed");
});

socket.on("error", (err) => {
  console.error("🚨 WebSocket Error:", err.message);
});

