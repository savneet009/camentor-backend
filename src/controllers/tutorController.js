import { askAI } from "../services/aiService.js";

export const chat = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required"
      });
    }

    const detailedPrompt = [
      "You are CA Mentor AI Tutor for Chartered Accountancy students.",
      "Give a detailed, exam-oriented answer.",
      "Structure: 1) concept overview 2) step-by-step explanation 3) examples 4) common mistakes 5) quick revision checklist.",
      "Keep it clear and practical.",
      `Student question: ${message}`,
    ].join("\n");

    const reply = await askAI(detailedPrompt);

    res.json({
      success: true,
      reply
    });

  } catch (error) {
    console.error("AI error:", error);
    const fallback = `I could not reach the AI provider right now. Here is a quick guide:\n\n1. Break the topic into definition, concept, and example.\n2. Solve 5 MCQs and 2 descriptive questions.\n3. Revise mistakes after 24 hours.\n\nAsk me again in a moment and I will try to generate a fuller answer.`;
    res.json({
      success: true,
      reply: fallback
    });
  }
};
