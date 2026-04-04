import mongoose from "mongoose";

const TaskSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    type: { type: String, default: "study" },
    duration: { type: Number, default: 60 },
    done: { type: Boolean, default: false },
  },
  { _id: false }
);

const DaySchema = new mongoose.Schema(
  {
    date: { type: String, default: "" },
    tasks: { type: [TaskSchema], default: [] },
  },
  { _id: false }
);

const InsightReasonSchema = new mongoose.Schema(
  {
    subject: { type: String, default: "" },
    reason: { type: String, default: "" },
    accuracy: { type: Number, default: null },
  },
  { _id: false }
);

const InsightsSchema = new mongoose.Schema(
  {
    examCountdownDays: { type: Number, default: null },
    examTargetDate: { type: String, default: "" },
    intensityLabel: { type: String, default: "steady" },
    weakSubjects: { type: [String], default: [] },
    reasons: { type: [InsightReasonSchema], default: [] },
  },
  { _id: false }
);

const StudyPlanSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, required: true },
    weekOf: { type: String, default: "" },
    days: {
      Mon: { type: DaySchema, default: () => ({ date: "", tasks: [] }) },
      Tue: { type: DaySchema, default: () => ({ date: "", tasks: [] }) },
      Wed: { type: DaySchema, default: () => ({ date: "", tasks: [] }) },
      Thu: { type: DaySchema, default: () => ({ date: "", tasks: [] }) },
      Fri: { type: DaySchema, default: () => ({ date: "", tasks: [] }) },
      Sat: { type: DaySchema, default: () => ({ date: "", tasks: [] }) },
      Sun: { type: DaySchema, default: () => ({ date: "", tasks: [] }) },
    },
    insights: { type: InsightsSchema, default: () => ({}) },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default mongoose.model("StudyPlan", StudyPlanSchema);
