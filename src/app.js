import express from "express";
import cors from "cors";

import dashboardRoutes from "./routes/dashboardRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import testRoutes from "./routes/testRoutes.js";
import tutorRoutes from "./routes/tutorRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import plannerRoutes from "./routes/plannerRoutes.js";
import materialsRoutes from "./routes/materialsRoutes.js";
import icaiRoutes from "./routes/icaiRoutes.js";
import notesRoutes from "./routes/notesRoutes.js";
import videosRoutes from "./routes/videosRoutes.js";
import { createRateLimit } from "./middleware/rateLimit.js";

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("CORS origin not allowed"));
  },
  credentials: true,
}));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(createRateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  max: Number(process.env.RATE_LIMIT_MAX || 180),
}));

app.use(express.json({ limit: process.env.JSON_LIMIT || "20mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/tutor", tutorRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/planner", plannerRoutes);
app.use("/api/materials", materialsRoutes);
app.use("/api/icai", icaiRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/videos", videosRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.get("/", (req,res)=>{
 res.send("CA Mentor Backend Running");
});

export default app;
