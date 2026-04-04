import mongoose from "mongoose";

const TestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    testId: { type: String, required: true },
    testTitle: { type: String, required: true },
    level: { type: String, default: "Foundation" },
    subject: { type: String, default: "General" },
    difficulty: { type: String, default: "medium" },
    score: { type: Number, required: true },
    total: { type: Number, required: true },
    percentage: { type: Number, required: true },
    correct: { type: Number, default: 0 },
    wrong: { type: Number, default: 0 },
    timeTaken: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default mongoose.model("Test", TestSchema);
