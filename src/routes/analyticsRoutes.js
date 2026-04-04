import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import Test from "../models/Test.js";

const router = express.Router();

const fallbackTrend = [
  { month: "Jan", score: 58, target: 70 },
  { month: "Feb", score: 62, target: 70 },
  { month: "Mar", score: 66, target: 72 },
  { month: "Apr", score: 71, target: 72 },
  { month: "May", score: 74, target: 75 },
  { month: "Jun", score: 76, target: 75 },
];

const fallbackSubjects = [
  { subject: "Accounts", accuracy: 72 },
  { subject: "Law", accuracy: 64 },
  { subject: "Tax", accuracy: 59 },
  { subject: "Audit", accuracy: 67 },
];

const buildHeatmap = (tests) => {
  const today = new Date();
  const arr = [];
  for (let i = 34; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayTests = tests.filter((t) => new Date(t.createdAt).toISOString().slice(0, 10) === key);
    const hours = dayTests.length * 1.2;
    const intensity = hours >= 3 ? 3 : hours >= 2 ? 2 : hours >= 1 ? 1 : 0;
    arr.push({ date: key, hours, intensity });
  }
  return arr;
};

const buildPayload = async (userId) => {
  const tests = await Test.find({ userId }).sort({ createdAt: -1 });

  const totalTests = tests.length;
  const avg = totalTests ? Math.round(tests.reduce((s, t) => s + (t.percentage || 0), 0) / totalTests) : 0;
  const best = totalTests ? Math.max(...tests.map((t) => t.percentage || 0)) : 0;

  const grouped = tests.reduce((acc, t) => {
    const key = t.subject || "General";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t.percentage || 0);
    return acc;
  }, {});

  const subjectAccuracy = Object.entries(grouped).map(([subject, scores]) => ({
    subject,
    accuracy: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
  }));

  const weakTopics = (subjectAccuracy.length ? subjectAccuracy : fallbackSubjects)
    .map((s) => ({
      topic: `${s.subject} Core Concepts`,
      subject: s.subject,
      accuracy: s.accuracy,
      tests: grouped[s.subject]?.length || 1,
      trend: s.accuracy >= 70 ? "improving" : "stable",
    }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 6);

  return {
    success: true,
    overallStats: {
      totalTests,
      bestScore: Math.round(best || 0),
      totalStudyHours: Math.max(1, totalTests * 2),
      rank: Math.max(1, 1000 - totalTests * 7),
    },
    performanceTrend: tests.length ? tests.slice(0, 6).reverse().map((t, idx) => ({
      month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"][idx],
      score: Math.round(t.percentage || 0),
      target: 72,
    })) : fallbackTrend,
    subjectAccuracy: subjectAccuracy.length ? subjectAccuracy : fallbackSubjects,
    heatmap: buildHeatmap(tests),
    weakTopics,
    averageScore: avg,
  };
};

router.get("/full", authMiddleware, async (req, res) => {
  try {
    return res.json(await buildPayload(req.user.id));
  } catch (error) {
    console.error("analytics full error:", error);
    return res.status(500).json({ success: false, message: "Failed to load analytics" });
  }
});

router.get("/heatmap", authMiddleware, async (req, res) => {
  try {
    const data = await buildPayload(req.user.id);
    return res.json({ success: true, heatmap: data.heatmap });
  } catch (error) {
    console.error("analytics heatmap error:", error);
    return res.status(500).json({ success: false, message: "Failed to load heatmap" });
  }
});

router.get("/weak-topics", authMiddleware, async (req, res) => {
  try {
    const data = await buildPayload(req.user.id);
    return res.json({ success: true, weakTopics: data.weakTopics });
  } catch (error) {
    console.error("analytics weak topics error:", error);
    return res.status(500).json({ success: false, message: "Failed to load weak topics" });
  }
});

export default router;
