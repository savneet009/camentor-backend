import express from "express";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import authMiddleware from "../middleware/authMiddleware.js";
import Note from "../models/Note.js";
import { createRateLimit } from "../middleware/rateLimit.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_DIR = process.env.NOTES_STORAGE_DIR
  ? path.resolve(process.env.NOTES_STORAGE_DIR)
  : path.resolve(__dirname, "../../storage/notes");
const MAX_UPLOAD_BYTES = Number(process.env.NOTES_MAX_UPLOAD_BYTES || 15 * 1024 * 1024);
const ALLOWED_MIME = new Set([
  "application/pdf",
  "text/plain",
  "image/png",
  "image/jpeg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ALLOWED_EXT = new Set([".pdf", ".txt", ".png", ".jpg", ".jpeg", ".doc", ".docx"]);

const safeName = (name = "note") =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "note";

const noteToDto = (note, req) => ({
  id: String(note._id),
  title: note.title,
  description: note.description || "",
  level: note.level || "General",
  subject: note.subject || "General",
  visibility: note.visibility,
  originalName: note.originalName,
  mimeType: note.mimeType,
  size: note.size || 0,
  downloads: note.downloads || 0,
  owner: note.userId?.name || undefined,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
  fileUrl: `${req.protocol}://${req.get("host")}/api/notes/file/${note._id}`,
});

const uploadLimiter = createRateLimit({
  windowMs: Number(process.env.NOTES_UPLOAD_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.NOTES_UPLOAD_MAX || 20),
  keyGenerator: (req) => `${req.ip || "unknown"}:notes-upload:${req.user?.id || "anon"}`,
});

router.post("/upload", authMiddleware, uploadLimiter, async (req, res) => {
  try {
    const {
      title,
      description = "",
      level = "General",
      subject = "General",
      visibility = "private",
      fileName = "",
      mimeType = "application/octet-stream",
      contentBase64 = "",
    } = req.body || {};

    if (!title?.trim()) return res.status(400).json({ success: false, message: "Title is required" });
    if (!fileName || !contentBase64) return res.status(400).json({ success: false, message: "File is required" });
    if (!["private", "public"].includes(visibility)) {
      return res.status(400).json({ success: false, message: "Invalid visibility" });
    }
    const ext = path.extname(fileName || "").toLowerCase();
    const normalizedMime = String(mimeType || "application/octet-stream").toLowerCase();
    if (!ALLOWED_EXT.has(ext) || !ALLOWED_MIME.has(normalizedMime)) {
      return res.status(400).json({ success: false, message: "Unsupported file type" });
    }

    const base64 = String(contentBase64).split(",").pop() || "";
    let buffer;
    try {
      buffer = Buffer.from(base64, "base64");
    } catch {
      return res.status(400).json({ success: false, message: "Invalid base64 content" });
    }
    if (!buffer.length) return res.status(400).json({ success: false, message: "Invalid file content" });
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return res.status(400).json({ success: false, message: "File too large (max 15 MB)" });
    }

    await fs.mkdir(STORAGE_DIR, { recursive: true });
    const fileId = crypto.randomUUID();
    const storedName = `${fileId}-${safeName(fileName)}`;
    const storedPath = path.join(STORAGE_DIR, storedName);
    await fs.writeFile(storedPath, buffer);

    const note = await Note.create({
      userId: req.user.id,
      title: title.trim(),
      description: String(description || "").trim(),
      level: String(level || "General"),
      subject: String(subject || "General"),
      visibility,
      originalName: safeName(fileName),
      fileName: storedName,
      mimeType: String(mimeType || "application/octet-stream"),
      size: buffer.length,
      path: storedPath,
      updatedAt: new Date(),
    });

    return res.json({ success: true, note: noteToDto(note, req) });
  } catch (error) {
    console.error("notes upload error:", error);
    return res.status(500).json({ success: false, message: "Failed to upload note" });
  }
});

router.get("/mine", authMiddleware, async (req, res) => {
  try {
    const notes = await Note.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json({ success: true, notes: notes.map((n) => noteToDto(n, req)) });
  } catch (error) {
    console.error("notes mine error:", error);
    return res.status(500).json({ success: false, message: "Failed to load notes" });
  }
});

router.get("/public", authMiddleware, async (req, res) => {
  try {
    const notes = await Note.find({ visibility: "public" })
      .populate("userId", "name")
      .sort({ createdAt: -1 })
      .limit(200);
    return res.json({ success: true, notes: notes.map((n) => noteToDto(n, req)) });
  } catch (error) {
    console.error("notes public error:", error);
    return res.status(500).json({ success: false, message: "Failed to load public notes" });
  }
});

router.patch("/:id", authMiddleware, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ success: false, message: "Note not found" });
    if (String(note.userId) !== req.user.id) return res.status(403).json({ success: false, message: "Not allowed" });

    const allowed = ["title", "description", "level", "subject", "visibility"];
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        if (k === "visibility" && !["private", "public"].includes(req.body[k])) continue;
        note[k] = req.body[k];
      }
    }
    note.updatedAt = new Date();
    await note.save();
    return res.json({ success: true, note: noteToDto(note, req) });
  } catch (error) {
    console.error("notes update error:", error);
    return res.status(500).json({ success: false, message: "Failed to update note" });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ success: false, message: "Note not found" });
    if (String(note.userId) !== req.user.id) return res.status(403).json({ success: false, message: "Not allowed" });

    if (note.path) {
      try {
        await fs.unlink(note.path);
      } catch {
        // ignore missing files
      }
    }
    await note.deleteOne();
    return res.json({ success: true });
  } catch (error) {
    console.error("notes delete error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete note" });
  }
});

router.get("/file/:id", authMiddleware, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ success: false, message: "File not found" });
    const isOwner = String(note.userId) === req.user.id;
    if (note.visibility === "private" && !isOwner) {
      return res.status(403).json({ success: false, message: "Private note" });
    }
    if (!note.path || !fsSync.existsSync(note.path)) {
      return res.status(404).json({ success: false, message: "File missing from storage" });
    }

    note.downloads = Number(note.downloads || 0) + 1;
    note.updatedAt = new Date();
    await note.save();

    res.setHeader("Content-Type", note.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${note.originalName}"`);
    const stream = fsSync.createReadStream(note.path);
    stream.pipe(res);
  } catch (error) {
    console.error("notes file error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch file" });
  }
});

export default router;
