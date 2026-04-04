import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { chat } from "../controllers/tutorController.js";
import { tutorSuggestions } from "../constants/mockData.js";

const router = express.Router();

const historyStore = new Map();

router.post("/chat", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const userHistory = historyStore.get(userId) || [];

  const userMsg = { role: "user", content: req.body.message || "" };
  const next = [...userHistory, userMsg];
  historyStore.set(userId, next.slice(-30));

  const fakeRes = {
    status(code) {
      this.code = code;
      return this;
    },
    json(payload) {
      if (payload?.success && payload.reply) {
        const after = historyStore.get(userId) || [];
        after.push({ role: "assistant", content: payload.reply });
        historyStore.set(userId, after.slice(-30));
      }
      return res.status(this.code || 200).json(payload);
    },
  };

  return chat(req, fakeRes);
});

router.get("/history", authMiddleware, (req, res) => {
  const userId = req.user.id;
  return res.json({ success: true, history: historyStore.get(userId) || [] });
});

router.delete("/history", authMiddleware, (req, res) => {
  historyStore.delete(req.user.id);
  return res.json({ success: true, message: "Chat history cleared" });
});

router.get("/suggestions", authMiddleware, (req, res) => {
  return res.json({ success: true, suggestions: tutorSuggestions });
});

router.get("/daily-limit", authMiddleware, (req, res) => {
  const used = (historyStore.get(req.user.id) || []).filter((m) => m.role === "user").length;
  const limit = 50;
  return res.json({ success: true, unlimited: false, used, remaining: Math.max(0, limit - used), limit });
});

export default router;
