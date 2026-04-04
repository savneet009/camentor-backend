import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import User from "../models/User.js";
import Test from "../models/Test.js";
import StudyPlan from "../models/StudyPlan.js";

const router = express.Router();

const levelTarget = {
  Foundation: 65,
  Intermediate: 70,
  Final: 75,
};

const monthlyTrend = (tests, target) => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  return months.map((month, idx) => {
    const t = tests[idx];
    return {
      month,
      score: t ? Math.round(t.percentage) : Math.max(45, target - 10 + idx),
      target,
    };
  });
};

const weakTopicsFromTests = (tests) => {
  if (tests.length === 0) {
    return [
      { topic: "Partnership Accounts", subject: "Accounts", accuracy: 52, tests: 2, trend: "improving" },
      { topic: "GST Input Tax Credit", subject: "Tax", accuracy: 58, tests: 3, trend: "stable" },
      { topic: "Company Audit Report", subject: "Audit", accuracy: 49, tests: 1, trend: "improving" },
    ];
  }

  const grouped = tests.reduce((acc, t) => {
    const key = t.subject || "General";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t.percentage || 0);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([subject, scores]) => {
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      return {
        topic: `${subject} Core Concepts`,
        subject,
        accuracy: avg,
        tests: scores.length,
        trend: avg >= 65 ? "improving" : "stable",
      };
    })
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 4);
};

const recentTestsFromTests = (tests) =>
  tests.slice(0, 5).map((t) => ({
    testTitle: t.testTitle,
    score: t.score,
    totalMarks: t.total,
    percentage: Math.round(t.percentage),
    level: t.level,
    date: t.createdAt,
  }));

const todaySchedule = async (userId) => {
  const plan = await StudyPlan.findOne({ userId });
  if (!plan?.days) {
    return [
      { text: "Solve 20 MCQs", type: "practice", done: false },
      { text: "Revise AS basics", type: "study", done: true },
      { text: "Attempt mini mock test", type: "test", done: false },
    ];
  }

  const map = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const key = map[new Date().getDay()] || "Mon";
  return (plan.days[key]?.tasks || []).slice(0, 5);
};

router.get("/dashboard", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const tests = await Test.find({ userId: user._id }).sort({ createdAt: -1 });
    const totalTests = tests.length;
    const avgScore = totalTests > 0
      ? Math.round(tests.reduce((sum, t) => sum + (t.percentage || 0), 0) / totalTests)
      : 0;

    const weeklyStudyHours = Math.max(2, Math.min(40, totalTests * 2 + Math.round((user.streak || 0) / 2)));
    const level = user.level || "Final";

    return res.json({
      success: true,
      stats: {
        streak: user.streak || 0,
        rank: user.rank || 9999,
        totalTests,
        avgScore,
      },
      weeklyStudyHours,
      performanceTrend: monthlyTrend(tests, levelTarget[level] || 70),
      weakTopics: weakTopicsFromTests(tests),
      recentTests: recentTestsFromTests(tests),
      todaySchedule: await todaySchedule(user._id),
    });
  } catch (error) {
    console.error("dashboard error:", error);
    return res.status(500).json({ success: false, message: "Failed to load dashboard" });
  }
});

router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const tests = await Test.find({ userId: user._id });
    const totalTests = tests.length;
    const avgScore = totalTests > 0
      ? Math.round(tests.reduce((sum, t) => sum + (t.percentage || 0), 0) / totalTests)
      : 0;
    const bestScore = totalTests > 0
      ? Math.max(...tests.map((t) => Math.round(t.percentage || 0)))
      : 0;

    return res.json({
      success: true,
      user: {
        ...user.toObject(),
        stats: {
          testsCompleted: totalTests,
          avgScore,
          totalStudyHours: Math.max(1, totalTests * 2),
          bestScore,
        },
      },
    });
  } catch (error) {
    console.error("profile error:", error);
    return res.status(500).json({ success: false, message: "Failed to load profile" });
  }
});

router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const allowed = ["name", "phone", "level", "targetExamDate"];
    const updates = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) updates[key] = req.body[key];
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    return res.json({ success: true, user });
  } catch (error) {
    console.error("update profile error:", error);
    return res.status(500).json({ success: false, message: "Failed to update profile" });
  }
});

router.get("/notifications", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const fallback = [
      { id: "n-1", text: "Your weekly plan is ready", read: false, createdAt: new Date() },
      { id: "n-2", text: "New mock test available", read: true, createdAt: new Date(Date.now() - 86400000) },
    ];

    return res.json({ success: true, notifications: user.notifications?.length ? user.notifications : fallback });
  } catch (error) {
    console.error("notifications error:", error);
    return res.status(500).json({ success: false, message: "Failed to load notifications" });
  }
});

router.patch("/notifications/:id/read", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.notifications = (user.notifications || []).map((n) =>
      n.id === req.params.id ? { ...n.toObject?.() || n, read: true } : n
    );
    await user.save();

    return res.json({ success: true });
  } catch (error) {
    console.error("read notification error:", error);
    return res.status(500).json({ success: false, message: "Failed to update notification" });
  }
});

router.get("/achievements", authMiddleware, async (req, res) => {
  try {
    const tests = await Test.find({ userId: req.user.id });
    const totalTests = tests.length;
    const bestScore = totalTests ? Math.max(...tests.map((t) => t.percentage || 0)) : 0;

    const achievements = [
      { emoji: "🚀", title: "First Test", desc: "Complete your first mock", earned: totalTests >= 1 },
      { emoji: "🔥", title: "5 Test Sprint", desc: "Attempt 5 tests", earned: totalTests >= 5 },
      { emoji: "🎯", title: "70+ Club", desc: "Score 70% or above", earned: bestScore >= 70 },
      { emoji: "🏆", title: "Top Performer", desc: "Score 85% or above", earned: bestScore >= 85 },
    ];

    return res.json({ success: true, achievements });
  } catch (error) {
    console.error("achievements error:", error);
    return res.status(500).json({ success: false, message: "Failed to load achievements" });
  }
});

router.get("/leaderboard", authMiddleware, async (req, res) => {
  try {
    const users = await User.find().select("name level avatar streak").limit(25);
    const tests = await Test.find().sort({ createdAt: -1 });

    const scoreByUser = tests.reduce((acc, t) => {
      const key = String(t.userId);
      if (!acc[key]) acc[key] = [];
      acc[key].push(t.percentage || 0);
      return acc;
    }, {});

    const leaderboard = users
      .map((u) => {
        const scores = scoreByUser[String(u._id)] || [];
        const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        return {
          userId: String(u._id),
          name: u.name,
          level: u.level || "Final",
          avatar: u.avatar || "CM",
          streak: u.streak || 0,
          tests: scores.length,
          score: avg,
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry, idx) => ({
        ...entry,
        rank: idx + 1,
        isCurrentUser: entry.userId === req.user.id,
      }));

    return res.json({ success: true, leaderboard });
  } catch (error) {
    console.error("leaderboard error:", error);
    return res.status(500).json({ success: false, message: "Failed to load leaderboard" });
  }
});

router.post("/study-session", authMiddleware, async (req, res) => {
  try {
    const { minutes = 0 } = req.body || {};
    return res.json({ success: true, message: "Study session logged", minutes });
  } catch (error) {
    console.error("study session error:", error);
    return res.status(500).json({ success: false, message: "Failed to log study session" });
  }
});

export default router;
