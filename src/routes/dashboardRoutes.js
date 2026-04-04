import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    success: true,
    data: {
      user: {
        name: "Savneet"
      },
      stats: {
        totalTests: 12,
        averageScore: 74,
        aiQuestions: 38
      },
      progress: [
        { day: "Mon", score: 60 },
        { day: "Tue", score: 65 },
        { day: "Wed", score: 70 },
        { day: "Thu", score: 75 },
        { day: "Fri", score: 80 }
      ],
      subjects: [
        { subject: "Accounts", score: 78 },
        { subject: "Law", score: 65 },
        { subject: "Economics", score: 72 }
      ],
      recentActivity: [
        { type: "test", text: "Accounts test - 78%" },
        { type: "ai", text: "Asked about GST" }
      ]
    }
  });
});

export default router;