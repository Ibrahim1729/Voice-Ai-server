const fetch = require("node-fetch");
require("dotenv").config();

// Replace with your actual OpenAI API key in .env
const OPENAI_KEY = process.env.OPENAI_API_KEY;

async function testGPT4() {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello, what is the capital of France?" }
        ]
      })
    });

    const data = await res.json();

    if (res.ok) {
      console.log("✅ GPT-4 Response:", data.choices[0].message.content);
    } else {
      console.error("❌ OpenAI Error:", data);
    }
  } catch (err) {
    console.error("❌ Request Failed:", err.message);
  }
}

testGPT4();
