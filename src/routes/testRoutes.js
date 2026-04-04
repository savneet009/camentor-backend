import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import Test from "../models/Test.js";
import { testCatalog } from "../constants/mockData.js";

const router = express.Router();

const byLevel = (level) => (level ? testCatalog.filter((t) => t.level === level) : testCatalog);

router.get("/", authMiddleware, async (req, res) => {
  try {
    const testsForLevel = byLevel(req.query.level);
    const attempts = await Test.find({ userId: req.user.id });

    const result = testsForLevel.map((t) => {
      const mine = attempts.filter((a) => a.testId === t.id);
      const best = mine.length ? Math.max(...mine.map((m) => m.percentage || 0)) : 0;
      return {
        id: t.id,
        title: t.title,
        level: t.level,
        difficulty: t.difficulty,
        duration: t.duration,
        questionIds: t.questions.map((q) => q.id),
        passingMarks: t.passingMarks,
        totalMarks: t.totalMarks,
        userAttempts: mine.length,
        bestPercentage: Math.round(best),
        passed: best >= (t.passingMarks / t.totalMarks) * 100,
      };
    });

    return res.json({ success: true, tests: result });
  } catch (error) {
    console.error("tests list error:", error);
    return res.status(500).json({ success: false, message: "Failed to load tests" });
  }
});

router.get("/questions/random", authMiddleware, (req, res) => {
  try {
    const n = Math.max(1, Math.min(20, Number(req.query.n) || 5));
    const level = req.query.level;
    const pool = byLevel(level).flatMap((t) => t.questions.map((q) => ({ ...q, testId: t.id, level: t.level })));

    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(n, pool.length));
    return res.json({ success: true, questions: shuffled });
  } catch (error) {
    console.error("random questions error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch random questions" });
  }
});

router.get("/history/all", authMiddleware, async (req, res) => {
  try {
    const history = await Test.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json({ success: true, history });
  } catch (error) {
    console.error("test history error:", error);
    return res.status(500).json({ success: false, message: "Failed to load history" });
  }
});

router.get("/:id", authMiddleware, (req, res) => {
  const test = testCatalog.find((t) => t.id === req.params.id);
  if (!test) return res.status(404).json({ success: false, message: "Test not found" });

  return res.json({
    success: true,
    test: {
      ...test,
      questionIds: test.questions.map((q) => q.id),
    },
  });
});

router.post("/:id/submit", authMiddleware, async (req, res) => {
  try {
    const test = testCatalog.find((t) => t.id === req.params.id);
    if (!test) return res.status(404).json({ success: false, message: "Test not found" });

    const answers = req.body.answers || {};
    const timeTaken = Number(req.body.timeTaken || 0);

    let correct = 0;
    let wrong = 0;

    const detailedResults = test.questions.map((q) => {
      const submitted = answers[q.id];
      const isCorrect = submitted === q.correctAnswer;
      if (submitted !== undefined) {
        if (isCorrect) correct += 1;
        else wrong += 1;
      }

      return {
        questionId: q.id,
        question: q.question,
        options: q.options,
        submitted,
        correct: q.correctAnswer,
        isCorrect,
        explanation: q.explanation,
      };
    });

    const score = correct;
    const totalMarks = test.questions.length;
    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
    const passPercent = (test.passingMarks / test.totalMarks) * 100;
    const passed = percentage >= passPercent;

    const attempt = await Test.create({
      userId: req.user.id,
      testId: test.id,
      testTitle: test.title,
      level: test.level,
      subject: test.subject,
      difficulty: test.difficulty,
      score,
      total: totalMarks,
      percentage,
      correct,
      wrong,
      timeTaken,
      passed,
    });

    const grade = percentage >= 85 ? "A" : percentage >= 70 ? "B" : percentage >= 55 ? "C" : "D";

    return res.json({
      success: true,
      message: passed ? "Great job. You passed this test." : "Good attempt. Review explanations and retry.",
      result: {
        id: attempt._id,
        score,
        totalMarks,
        correct,
        wrong,
        passed,
        percentage: Math.round(percentage),
        grade,
      },
      detailedResults,
    });
  } catch (error) {
    console.error("submit test error:", error);
    return res.status(500).json({ success: false, message: "Failed to submit test" });
  }
});

export default router;
