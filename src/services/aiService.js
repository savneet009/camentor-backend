import axios from "axios";

export const askAI = async (message) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY");
    }

    const apiVersion = process.env.GEMINI_API_VERSION || "v1beta";
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const maxOutputTokens = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 2048);
    const endpoint = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent`;

    const response = await axios.post(
      `${endpoint}?key=${apiKey}`,
      {
        contents: [
          {
            parts: [
              { text: message }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens,
        },
      }
    );

    const reply =
      response.data.candidates?.[0]?.content?.parts?.[0]?.text;

    return reply || "No response from AI";

  } catch (error) {

    console.error("❌ Gemini API error:",
      error.response?.data || error.message
    );

    throw error;
  }
};
