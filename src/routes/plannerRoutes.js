import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import StudyPlan from "../models/StudyPlan.js";
import User from "../models/User.js";
import Test from "../models/Test.js";
import { testCatalog, materialsCatalog } from "../constants/mockData.js";

const router = express.Router();

const weekKeys = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const startOfWeekDate = () => {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday;
};

const fmtDate = (date) => {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const normalizeLevel = (level) =>
  ["Foundation", "Intermediate", "Final"].includes(level) ? level : "Final";

const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const daysUntil = (targetDate) => {
  const parsed = parseDate(targetDate);
  if (!parsed) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return Math.ceil((parsed.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

const titleCase = (txt = "") =>
  txt
    .toString()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const cleanSubject = (subject = "") => {
  const s = titleCase(subject);
  if (s === "Tax") return "Taxation";
  if (s === "Accounts") return "Accounting";
  if (s === "Fm & Sm") return "FM & SM";
  return s || "General";
};

const getLevelSubjects = (level) => {
  const fromTests = testCatalog
    .filter((t) => t.level === level)
    .map((t) => cleanSubject(t.subject));
  const fromMaterials = materialsCatalog
    .filter((m) => m.level === level)
    .map((m) => cleanSubject(m.subject?.name));
  const merged = [...new Set([...fromTests, ...fromMaterials].filter(Boolean))];
  if (merged.length > 0) return merged;
  if (level === "Foundation") return ["Accounting", "Law", "Maths", "Economics"];
  if (level === "Intermediate") return ["Accounting", "Law", "Taxation", "Costing", "Audit", "FM & SM"];
  return ["Financial Reporting", "SFM", "Audit", "Taxation", "IBS"];
};

const weakSubjectsFromTests = (tests, level) => {
  const mine = (tests || []).filter((t) => (t.level || level) === level);
  const grouped = mine.reduce((acc, t) => {
    const k = cleanSubject(t.subject || "General");
    if (!acc[k]) acc[k] = [];
    acc[k].push(Number(t.percentage || 0));
    return acc;
  }, {});

  const ranked = Object.entries(grouped)
    .map(([subject, scores]) => ({
      subject,
      avg: scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length),
      attempts: scores.length,
    }))
    .sort((a, b) => a.avg - b.avg);

  return ranked;
};

const intensityFromExamDate = (targetExamDate) => {
  const d = daysUntil(targetExamDate);
  if (d === null) return { label: "steady", dailyMinutes: 210, weeklyMocks: 2, revisionBoost: false };
  if (d <= 30) return { label: "sprint", dailyMinutes: 330, weeklyMocks: 4, revisionBoost: true };
  if (d <= 90) return { label: "high", dailyMinutes: 270, weeklyMocks: 3, revisionBoost: true };
  if (d <= 180) return { label: "medium", dailyMinutes: 230, weeklyMocks: 2, revisionBoost: false };
  return { label: "steady", dailyMinutes: 200, weeklyMocks: 1, revisionBoost: false };
};

const buildPlan = ({ user, tests = [] }) => {
  const level = normalizeLevel(user?.level || "Final");
  const allSubjects = getLevelSubjects(level);
  const weakRanked = weakSubjectsFromTests(tests, level);
  const weak = weakRanked.slice(0, 3).map((w) => w.subject);
  const strong = allSubjects.filter((s) => !weak.includes(s));
  const orderedSubjects = [...weak, ...strong];
  const intensity = intensityFromExamDate(user?.targetExamDate);
  const countdown = daysUntil(user?.targetExamDate);
  const monday = startOfWeekDate();
  const base = intensity.dailyMinutes;
  let seq = 0;
  const taskId = (dayKey, idx) => `task-${dayKey}-${Date.now()}-${idx}-${seq++}`;

  const mockDays = intensity.weeklyMocks >= 4
    ? new Set(["Tue", "Thu", "Sat", "Sun"])
    : intensity.weeklyMocks === 3
      ? new Set(["Wed", "Fri", "Sun"])
      : intensity.weeklyMocks === 2
        ? new Set(["Wed", "Sat"])
        : new Set(["Sat"]);

  const days = {};
  weekKeys.forEach((key, idx) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + idx);
    const focus = orderedSubjects[idx % orderedSubjects.length] || allSubjects[0] || "General";
    const support = orderedSubjects[(idx + 1) % orderedSubjects.length] || focus;
    const tasks = [];

    tasks.push({
      id: taskId(key, 1),
      text: `Core study: ${focus}`,
      type: "study",
      duration: Math.round(base * 0.45),
      done: false,
    });

    tasks.push({
      id: taskId(key, 2),
      text: `Practice drill: ${focus}`,
      type: "practice",
      duration: Math.round(base * 0.30),
      done: false,
    });

    if (mockDays.has(key)) {
      tasks.push({
        id: taskId(key, 3),
        text: `${level} mock test (${focus})`,
        type: "test",
        duration: Math.round(base * 0.35),
        done: false,
      });
    } else {
      tasks.push({
        id: taskId(key, 3),
        text: `Revision + mistake log: ${support}`,
        type: "revision",
        duration: Math.round(base * 0.25),
        done: false,
      });
    }

    if (intensity.revisionBoost || idx === 6) {
      tasks.push({
        id: taskId(key, 4),
        text: `Quick recap and formula revision`,
        type: "revision",
        duration: 35,
        done: false,
      });
    }

    days[key] = { date: fmtDate(date), tasks };
  });

  const reasons = weakRanked.slice(0, 3).map((w) => ({
    subject: w.subject,
    reason: `Low recent accuracy in ${w.subject} (${Math.round(w.avg)}%)`,
    accuracy: Math.round(w.avg),
  }));

  if (reasons.length === 0) {
    reasons.push(
      { subject: allSubjects[0] || "General", reason: "Start with core subject to build consistency", accuracy: null },
      { subject: allSubjects[1] || allSubjects[0] || "General", reason: "Second priority for balanced weekly coverage", accuracy: null }
    );
  }

  return {
    weekOf: fmtDate(monday),
    days,
    insights: {
      examCountdownDays: countdown,
      examTargetDate: user?.targetExamDate || "",
      intensityLabel: intensity.label,
      weakSubjects: weak,
      reasons,
    },
  };
};

router.get("/", authMiddleware, async (req, res) => {
  try {
    let plan = await StudyPlan.findOne({ userId: req.user.id });
    const currentWeek = fmtDate(startOfWeekDate());

    if (!plan || plan.weekOf !== currentWeek) {
      const user = await User.findById(req.user.id);
      const tests = await Test.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(40);
      const generated = buildPlan({ user, tests });

      plan = await StudyPlan.findOneAndUpdate(
        { userId: req.user.id },
        {
          ...generated,
          userId: req.user.id,
          updatedAt: new Date(),
        },
        { upsert: true, new: true }
      );
    }

    return res.json({ success: true, plan });
  } catch (error) {
    console.error("planner get error:", error);
    return res.status(500).json({ success: false, message: "Failed to load plan" });
  }
});

router.post("/generate", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const tests = await Test.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(40);
    const generated = buildPlan({ user, tests });

    const plan = await StudyPlan.findOneAndUpdate(
      { userId: req.user.id },
      {
        ...generated,
        userId: req.user.id,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    return res.json({ success: true, plan });
  } catch (error) {
    console.error("planner generate error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate plan" });
  }
});

router.post("/:day/tasks", authMiddleware, async (req, res) => {
  try {
    const day = req.params.day;
    if (!weekKeys.includes(day)) return res.status(400).json({ success: false, message: "Invalid day" });

    const plan = await StudyPlan.findOne({ userId: req.user.id });
    if (!plan) return res.status(404).json({ success: false, message: "No study plan found" });

    const task = {
      id: `task-${Date.now()}`,
      text: req.body.text || "New task",
      type: req.body.type || "study",
      duration: Number(req.body.duration || 60),
      done: false,
    };

    plan.days[day].tasks.push(task);
    plan.updatedAt = new Date();
    await plan.save();

    return res.json({ success: true, task });
  } catch (error) {
    console.error("planner add task error:", error);
    return res.status(500).json({ success: false, message: "Failed to add task" });
  }
});

router.patch("/:day/tasks/:taskId", authMiddleware, async (req, res) => {
  try {
    const { day, taskId } = req.params;
    if (!weekKeys.includes(day)) return res.status(400).json({ success: false, message: "Invalid day" });

    const plan = await StudyPlan.findOne({ userId: req.user.id });
    if (!plan) return res.status(404).json({ success: false, message: "No study plan found" });

    const task = plan.days[day].tasks.find((t) => t.id === taskId);
    if (!task) return res.status(404).json({ success: false, message: "Task not found" });

    if (typeof req.body.done === "boolean") task.done = req.body.done;
    plan.updatedAt = new Date();
    await plan.save();

    return res.json({ success: true, task });
  } catch (error) {
    console.error("planner toggle task error:", error);
    return res.status(500).json({ success: false, message: "Failed to update task" });
  }
});

router.get("/goals/weekly", authMiddleware, async (req, res) => {
  try {
    const plan = await StudyPlan.findOne({ userId: req.user.id });
    if (!plan) return res.json({ success: true, goals: [] });
    const user = await User.findById(req.user.id).select("targetExamDate");

    const tasks = weekKeys.flatMap((k) => plan.days[k]?.tasks || []);
    const doneTasks = tasks.filter((t) => t.done);
    const done = doneTasks.length;
    const doneMinutes = doneTasks.reduce((sum, t) => sum + Number(t.duration || 0), 0);
    const totalMinutes = tasks.reduce((sum, t) => sum + Number(t.duration || 0), 0);
    const intensity = intensityFromExamDate(user?.targetExamDate);
    const monday = startOfWeekDate();
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    const testsThisWeek = await Test.countDocuments({
      userId: req.user.id,
      createdAt: { $gte: monday, $lte: sunday },
    });

    const byType = (type) => tasks.filter((t) => t.type === type);
    const doneByType = (type) => byType(type).filter((t) => t.done).length;

    const goals = [
      {
        label: "Study hours",
        done: Number((doneMinutes / 60).toFixed(1)),
        target: Number((Math.max(1, totalMinutes) / 60).toFixed(1)),
        percentage: totalMinutes ? Math.round((doneMinutes / totalMinutes) * 100) : 0,
        onTrack: doneMinutes >= Math.ceil(totalMinutes * 0.55),
      },
      {
        label: "Practice tasks",
        done: doneByType("practice"),
        target: Math.max(1, byType("practice").length),
        percentage: byType("practice").length ? Math.round((doneByType("practice") / byType("practice").length) * 100) : 0,
        onTrack: doneByType("practice") >= Math.ceil(Math.max(1, byType("practice").length) * 0.5),
      },
      {
        label: "Mock tests",
        done: testsThisWeek,
        target: Math.max(1, intensity.weeklyMocks),
        percentage: Math.min(100, Math.round((testsThisWeek / Math.max(1, intensity.weeklyMocks)) * 100)),
        onTrack: testsThisWeek >= Math.max(1, intensity.weeklyMocks - 1),
      },
    ];

    return res.json({ success: true, goals });
  } catch (error) {
    console.error("planner weekly goals error:", error);
    return res.status(500).json({ success: false, message: "Failed to load goals" });
  }
});

export default router;
