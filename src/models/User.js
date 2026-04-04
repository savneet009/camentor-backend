import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    level: { type: String, default: "Final" },
    phone: { type: String, default: "" },
    avatar: { type: String, default: "CM" },
    plan: { type: String, default: "free" },
    rank: { type: Number, default: 9999 },
    streak: { type: Number, default: 0 },
    targetExamDate: { type: String, default: "" },
    notifications: { type: [NotificationSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default mongoose.model("User", UserSchema);
