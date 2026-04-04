import express from "express";
import axios from "axios";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

const STUDY_MATERIAL_BASE = "https://boslive.icai.org/education_content.php?p=Study+Material&c=";
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = { at: 0, byLevel: {} };

const levelMap = {
  Foundation: "foundation",
  Intermediate: "intermediate",
  Final: "final",
};

const SUBJECT_COLORS = {
  Accounting: "#6366f1",
  Accounts: "#6366f1",
  Law: "#8b5cf6",
  Taxation: "#10b981",
  Tax: "#10b981",
  Audit: "#f59e0b",
  Costing: "#06b6d4",
  Economics: "#22c55e",
  Maths: "#f97316",
  "FM & SM": "#14b8a6",
  SFM: "#0ea5e9",
  IBS: "#f43f5e",
  "All Subjects": "#64748b",
};

const decode = (s = "") =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

const strip = (s = "") => decode(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

const toAbs = (href, base) => {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
};

const fetchText = async (url) => {
  const { data } = await axios.get(url, {
    timeout: 45000,
    maxRedirects: 5,
    headers: {
      "User-Agent": "CA-Mentor/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  return String(data || "");
};

const extractLinks = (html, baseUrl) => {
  const links = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = decode(m[1] || "").trim();
    const text = strip(m[2] || "");
    const abs = toAbs(href, baseUrl);
    if (!href || !abs) continue;
    links.push({ href: abs, text });
  }
  return links;
};

const detectSubject = (txt = "") => {
  const h = txt.toLowerCase();
  if (/(account|financial reporting|fr\b)/i.test(h)) return "Accounting";
  if (/(law|legal|ethics)/i.test(h)) return "Law";
  if (/(tax|gst|idt|direct tax|indirect tax)/i.test(h)) return "Taxation";
  if (/(audit|assurance)/i.test(h)) return "Audit";
  if (/(cost|costing|management accounting)/i.test(h)) return "Costing";
  if (/(economics)/i.test(h)) return "Economics";
  if (/(math|quantitative aptitude|statistics)/i.test(h)) return "Maths";
  if (/(financial management|strategic management|fm|sm)/i.test(h)) return "FM & SM";
  if (/(sfm|advanced financial management)/i.test(h)) return "SFM";
  if (/(integrated business solutions|multidisciplinary case study|ibs)/i.test(h)) return "IBS";
  return "All Subjects";
};

const fileNameFromUrl = (url = "") => {
  try {
    const p = new URL(url).pathname;
    const seg = p.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(seg);
  } catch {
    return "";
  }
};

const normalizeTitle = (title = "", sourceUrl = "") => {
  const t = title.trim();
  if (t) return t;
  return fileNameFromUrl(sourceUrl).replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "ICAI Notes";
};

const detectYear = (...chunks) => {
  const text = chunks.filter(Boolean).join(" ");
  const years = text.match(/\b20\d{2}\b/g) || [];
  if (years.length === 0) return null;
  return Math.max(...years.map((y) => Number(y)));
};

const dedupeBy = (arr, keyFn) => {
  const seen = new Set();
  return arr.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const mapToMaterial = (doc, idx) => ({
  id: `note-${doc.level}-${idx}-${Buffer.from(doc.sourceUrl).toString("base64").slice(0, 8)}`,
  level: doc.level,
  type: "Notes",
  title: normalizeTitle(doc.title, doc.sourceUrl),
  description: [
    "Official ICAI Study Material notes.",
    doc.section ? `Section: ${doc.section}` : null,
    doc.year ? `Year: ${doc.year}` : null,
    doc.subject ? `Subject: ${doc.subject}` : null,
  ].filter(Boolean).join(" "),
  pages: "--",
  fileSize: "--",
  progress: 0,
  downloads: 0,
  rating: 0,
  subject: { name: doc.subject || "All Subjects", color: SUBJECT_COLORS[doc.subject] || "#6366f1" },
  viewUrl: doc.sourceUrl,
  sourceUrl: doc.sourceUrl,
});

const fetchLevelNotes = async (level) => {
  const levelKey = levelMap[level];
  if (!levelKey) return [];
  const indexUrl = `${STUDY_MATERIAL_BASE}${levelKey}`;
  const html = await fetchText(indexUrl);
  const postLinks = dedupeBy(
    extractLinks(html, indexUrl).filter((l) => /https:\/\/www\.icai\.org\/post\.html\?post_id=\d+/i.test(l.href)),
    (x) => x.href
  );

  const out = [];
  for (const post of postLinks) {
    const idMatch = post.href.match(/post_id=(\d+)/i);
    const postUrl = idMatch ? `https://www.icai.org/post/${idMatch[1]}` : post.href;
    let postHtml = "";
    try {
      postHtml = await fetchText(postUrl);
    } catch {
      continue;
    }

    const pdfLinks = dedupeBy(
      extractLinks(postHtml, postUrl).filter((l) => /https:\/\/resource\.cdn\.icai\.org\/.+\.pdf(?:$|[?#])/i.test(l.href)),
      (x) => x.href
    );

    for (const pdf of pdfLinks) {
      const subject = detectSubject(`${post.text} ${pdf.text} ${pdf.href}`);
      const year = detectYear(post.text, pdf.text, pdf.href);
      out.push({
        level,
        section: post.text,
        title: pdf.text || post.text,
        subject,
        year,
        sourceUrl: pdf.href,
      });
    }
  }
  return dedupeBy(out, (x) => x.sourceUrl);
};

const getNotes = async (level) => {
  const now = Date.now();
  const isFresh = now - cache.at < CACHE_TTL_MS;
  if (!isFresh) {
    cache.byLevel = {};
    cache.at = now;
  }

  const fetchOne = async (lv) => {
    if (cache.byLevel[lv]) return cache.byLevel[lv];
    const notes = await fetchLevelNotes(lv);
    cache.byLevel[lv] = notes;
    return notes;
  };

  if (level && levelMap[level]) return fetchOne(level);
  const levels = ["Foundation", "Intermediate", "Final"];
  const all = (await Promise.all(levels.map(fetchOne))).flat();
  return dedupeBy(all, (x) => x.sourceUrl);
};

router.get("/", authMiddleware, async (req, res) => {
  try {
    const level = (req.query.level || "").toString().trim();
    const notes = await getNotes(level);
    const materials = notes.map(mapToMaterial);
    return res.json({ success: true, materials });
  } catch (error) {
    console.error("materials list error:", error.message || error);
    return res.status(500).json({ success: false, message: "Failed to load ICAI notes" });
  }
});

router.get("/search/query", authMiddleware, async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim().toLowerCase();
    if (!q) return res.json({ success: true, results: [] });

    const notes = await getNotes("All");
    const materials = notes.map(mapToMaterial);
    const results = materials.filter((m) =>
      `${m.title} ${m.description} ${m.subject?.name || ""} ${m.level || ""}`.toLowerCase().includes(q)
    );
    return res.json({ success: true, results });
  } catch (error) {
    console.error("materials search error:", error.message || error);
    return res.status(500).json({ success: false, message: "Failed to search ICAI notes" });
  }
});

export default router;

