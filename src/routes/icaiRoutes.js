import express from "express";
import axios from "axios";

const router = express.Router();

const RTP_INDEX_URL = "https://boslive.icai.org/education_content_rtp.php";
const MTP_INDEX_URL = "https://boslive.icai.org/education_content.php?p=Mock+Test+Papers";
const QP_BASE_URL = "https://boslive.icai.org/education_content.php?p=Question+Papers&c=";
const CACHE_TTL_MS = 30 * 60 * 1000;
let resourcesCache = { at: 0, rtp: null, mtp: null, pyq: null };

const ALLOWED_HOSTS = new Set([
  "boslive.icai.org",
  "resource.cdn.icai.org",
  "www.icai.org",
  "icai.org",
]);

const decodeEntities = (str = "") =>
  str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "-");

const stripHtml = (str = "") => decodeEntities(str.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

const toAbsolute = (href, base) => {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
};

const extractLinks = (html, baseUrl) => {
  const links = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = decodeEntities(m[1] || "").trim();
    const text = stripHtml(m[2] || "");
    if (!href || !text) continue;
    const abs = toAbsolute(href, baseUrl);
    if (!abs) continue;
    links.push({ href: abs, text });
  }
  return links;
};

const extractQuestionRows = (html, baseUrl) => {
  const rows = [];
  const rowRe = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>[\s\S]*?<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/a>[\s\S]*?<\/td>\s*<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const details = stripHtml(m[1] || "");
    const href = decodeEntities(m[2] || "").trim();
    const abs = toAbsolute(href, baseUrl);
    if (!details || !abs) continue;
    rows.push({ details, href: abs });
  }
  return rows;
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

const getHost = (u) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return "";
  }
};

const isAllowedSource = (url) => {
  const host = getHost(url);
  return host && [...ALLOWED_HOSTS].some((h) => host === h || host.endsWith(`.${h}`));
};

const isPdfUrl = (url = "") => /\.pdf(?:$|[?#])/i.test(url);

const fileNameFromUrl = (url = "") => {
  try {
    const p = new URL(url).pathname;
    const seg = p.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(seg);
  } catch {
    return "";
  }
};

const detectLanguage = (title = "", sourceUrl = "", attempt = "") => {
  const hay = `${title} ${sourceUrl} ${attempt}`.toLowerCase();
  return /(hindi|hindi medium|\bhm\b)/i.test(hay) ? "Hindi" : "English";
};

const detectPaperNumber = (title = "", sourceUrl = "") => {
  const t = title.toLowerCase();
  const fromTitle = t.match(/paper[\s\-:]*([1-6])/i);
  if (fromTitle) return Number(fromTitle[1]);
  const file = fileNameFromUrl(sourceUrl).toLowerCase();
  const fromFile = file.match(/(?:^|[^a-z0-9])p([1-6])(?:[^a-z0-9]|$)/i);
  if (fromFile) return Number(fromFile[1]);
  return null;
};

const humanizeFileName = (name = "") =>
  name
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeDocTitle = (title, sourceUrl, type) => {
  const t = (title || "").trim();
  if (!t || /^(click here|home|about us)$/i.test(t)) {
    const file = humanizeFileName(fileNameFromUrl(sourceUrl));
    return file ? `${type} - ${file}` : `${type} PDF`;
  }
  return t;
};

const proxyUrlFor = (req, sourceUrl) => `${req.protocol}://${req.get("host")}/api/icai/proxy?url=${encodeURIComponent(sourceUrl)}`;

const toHttps = (url = "") => {
  try {
    const u = new URL(url);
    u.protocol = "https:";
    return u.toString();
  } catch {
    return url;
  }
};

const normalizeLandingUrl = (url = "") => {
  const m = url.match(/https?:\/\/www\.icai\.org\/post\.html\?post_id=(\d+)/i);
  if (m) return `https://www.icai.org/post/${m[1]}`;
  if (/^http:\/\//i.test(url)) return toHttps(url);
  return url;
};

const EXCLUDED_PDF_KEYWORDS = [
  "schedule",
  "success",
  "announcement",
  "revisionary",
  "batch",
  "timetable",
  "class",
];

const isExcludedPdf = (text = "") => {
  const hay = text.toLowerCase();
  return EXCLUDED_PDF_KEYWORDS.some((k) => hay.includes(k));
};

const fetchText = async (url) => {
  const { data } = await axios.get(url, {
    timeout: 30000,
    maxRedirects: 5,
    headers: {
      "User-Agent": "CA-Mentor/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  return String(data || "");
};

const resolvePdfLinksFromLanding = async (url) => {
  if (isPdfUrl(url)) return [{ href: url, text: "" }];
  try {
    const landingUrl = normalizeLandingUrl(url);
    const html = await fetchText(landingUrl);
    return dedupeBy(
      extractLinks(html, landingUrl).filter((l) => isAllowedSource(l.href) && isPdfUrl(l.href)),
      (l) => l.href
    );
  } catch {
    return [];
  }
};

const SUBJECT_MATCHERS = [
  { key: "Accounting", regex: /(account|accounting|financial reporting|advanced accounting)/i },
  { key: "Law", regex: /(law|legal|ethics|corporate and other laws)/i },
  { key: "Taxation", regex: /(tax|gst|idt|direct tax|indirect tax)/i },
  { key: "Audit", regex: /(audit|assurance)/i },
  { key: "Costing", regex: /(cost|costing|management accounting)/i },
  { key: "Economics", regex: /(economics)/i },
  { key: "Maths", regex: /(math|quantitative aptitude|statistics)/i },
  { key: "FM & SM", regex: /(financial management|strategic management|fm|sm)/i },
  { key: "SFM", regex: /(sfm|advanced financial management)/i },
  { key: "IBS", regex: /(integrated business solutions|multidisciplinary case study|ibs)/i },
  { key: "Accounting", regex: /(principles and practice of accounting)/i },
  { key: "Law", regex: /(business laws and business correspondence and reporting)/i },
];

const detectSubject = (title = "", sourceUrl = "", attempt = "", course = "") => {
  const hay = `${title} ${sourceUrl} ${attempt}`;
  for (const item of SUBJECT_MATCHERS) {
    if (item.regex.test(hay)) return item.key;
  }

  const file = fileNameFromUrl(sourceUrl).toLowerCase();
  const paperMatch = file.match(/(?:^|[^a-z0-9])p([1-6])(?:[^a-z0-9]|$)/i);
  const p = paperMatch ? Number(paperMatch[1]) : null;
  if (p && /foundation/i.test(course)) {
    const map = { 1: "Accounting", 2: "Law", 3: "Maths", 4: "Economics" };
    if (map[p]) return map[p];
  }
  if (p && /intermediate/i.test(course)) {
    const map = { 1: "Accounting", 2: "Law", 3: "Taxation", 4: "Costing", 5: "Audit", 6: "FM & SM" };
    if (map[p]) return map[p];
  }
  if (p && /final/i.test(course)) {
    const map = { 1: "Accounting", 2: "SFM", 3: "Audit", 4: "Taxation", 5: "Taxation", 6: "IBS" };
    if (map[p]) return map[p];
  }

  return "All Subjects";
};

const detectYear = (...chunks) => {
  const text = chunks.filter(Boolean).join(" ");
  const years = text.match(/\b20\d{2}\b/g) || [];
  if (years.length === 0) return null;
  return Math.max(...years.map((y) => Number(y)));
};

const withMeta = (docs) =>
  docs.map((doc) => {
    const subject = detectSubject(doc.title, doc.sourceUrl, doc.attempt, doc.course);
    const year = detectYear(doc.title, doc.attempt, doc.course, doc.sourceUrl);
    const language = detectLanguage(doc.title, doc.sourceUrl, doc.attempt);
    const paper = detectPaperNumber(doc.title, doc.sourceUrl);
    const displayTitle = `Paper ${paper || "?"} - ${subject} - ${language} - ${year || "N/A"}`;
    return { ...doc, subject, year, language, paper, displayTitle };
  });

const filterByYearAndCourseAndSubject = (docs, years, course, subject) => {
  const minYear = new Date().getFullYear() - Math.max(1, years) + 1;
  return docs.filter((d) => {
    const yearOk = !d.year || d.year >= minYear;
    const courseOk = course === "All" || d.course === course;
    const subjectOk = subject === "All" || d.subject === subject || d.subject === "All Subjects";
    return yearOk && courseOk && subjectOk;
  });
};

const getRtpResources = async (req) => {
  const indexHtml = await fetchText(RTP_INDEX_URL);
  const courseLinks = extractLinks(indexHtml, RTP_INDEX_URL).filter((l) =>
    l.href.includes("education_content_rtp.php?c=")
  );

  const allRtp = [];

  for (const courseLink of dedupeBy(courseLinks, (l) => l.href)) {
    const courseName = courseLink.text;
    const courseHtml = await fetchText(courseLink.href);

    const attemptLinks = extractLinks(courseHtml, courseLink.href).filter((l) =>
      l.href.includes("education_content_rtp_list.php")
    );

    for (const attemptLink of dedupeBy(attemptLinks, (l) => l.href)) {
      const attemptName = attemptLink.text;
      const attemptHtml = await fetchText(attemptLink.href);

      const paperLinks = extractLinks(attemptHtml, attemptLink.href).filter(
        (l) => isAllowedSource(l.href) && isPdfUrl(l.href)
      );

      for (const p of dedupeBy(paperLinks, (x) => x.href + "|" + x.text)) {
        const hay = `${p.text} ${p.href} ${attemptName}`.toLowerCase();
        if (isExcludedPdf(hay)) continue;
        if (!(hay.includes("rtp") || p.href.includes("resource.cdn.icai.org"))) continue;
        allRtp.push({
          id: `rtp-${Buffer.from(p.href).toString("base64").slice(0, 24)}`,
          type: "RTP",
          course: courseName,
          attempt: attemptName,
          title: normalizeDocTitle(p.text, p.href, "RTP"),
          sourceUrl: p.href,
          viewUrl: proxyUrlFor(req, p.href),
        });
      }
    }
  }

  return dedupeBy(allRtp, (r) => r.sourceUrl);
};

const getMtpResources = async (req) => {
  const mtpHtml = await fetchText(MTP_INDEX_URL);
  const links = extractLinks(mtpHtml, MTP_INDEX_URL).filter(
    (l) => isAllowedSource(l.href) && isPdfUrl(l.href)
  );

  const rows = links
    .filter((l) => {
      const hay = `${l.text} ${l.href}`.toLowerCase();
      return hay.includes("mtp") || hay.includes("mock") || hay.includes("series");
    })
    .map((l) => {
      let course = "General";
      const hay = `${l.text} ${l.href}`;
      if (/(foundation|\bfnd\b)/i.test(hay)) course = "Foundation";
      else if (/(intermediate|\binter\b|\bipc\b)/i.test(hay)) course = "Intermediate";
      else if (/(final|\bfin\b)/i.test(hay)) course = "Final";

      return {
        id: `mtp-${Buffer.from(l.href).toString("base64").slice(0, 24)}`,
        type: "MTP",
        course,
        attempt: "",
        title: normalizeDocTitle(l.text, l.href, "MTP"),
        sourceUrl: l.href,
        viewUrl: proxyUrlFor(req, l.href),
      };
    });

  return dedupeBy(rows, (r) => r.sourceUrl);
};

const getPyqResources = async (req) => {
  const levelMap = [
    { key: "foundation", label: "Foundation" },
    { key: "intermediate", label: "Intermediate" },
    { key: "final", label: "Final" },
  ];

  const all = [];
  for (const lv of levelMap) {
    const url = `${QP_BASE_URL}${lv.key}`;
    const html = await fetchText(url);
    const rows = extractQuestionRows(html, url);

    for (const row of rows) {
      const pdfLinks = await resolvePdfLinksFromLanding(row.href);
      for (const link of pdfLinks) {
        const pdf = link.href;
        if (!pdf || !isAllowedSource(pdf) || !isPdfUrl(pdf)) continue;
        if (isExcludedPdf(`${row.details} ${pdf}`)) continue;
        all.push({
          id: `pyq-${Buffer.from(pdf).toString("base64").slice(0, 24)}`,
          type: "PYQ",
          course: lv.label,
          attempt: link.text || "",
          title: row.details,
          sourceUrl: pdf,
          viewUrl: proxyUrlFor(req, pdf),
        });
      }
    }
  }
  return dedupeBy(all, (x) => x.sourceUrl);
};

router.get("/resources", async (req, res) => {
  try {
    const years = Number(req.query.years || 5);
    const course = String(req.query.course || "All");
    const subject = String(req.query.subject || "All");

    let rtp;
    let mtp;
    let pyq;
    const cacheUsable =
      Array.isArray(resourcesCache.rtp) &&
      Array.isArray(resourcesCache.mtp) &&
      Array.isArray(resourcesCache.pyq) &&
      resourcesCache.mtp.length > 0 &&
      resourcesCache.pyq.length > 0 &&
      Date.now() - resourcesCache.at < CACHE_TTL_MS;
    if (cacheUsable) {
      rtp = resourcesCache.rtp;
      mtp = resourcesCache.mtp;
      pyq = resourcesCache.pyq;
    } else {
      [rtp, mtp, pyq] = await Promise.all([getRtpResources(req), getMtpResources(req), getPyqResources(req)]);
      resourcesCache = { at: Date.now(), rtp, mtp, pyq };
    }

    const rtpMeta = withMeta(rtp);
    const mtpMeta = withMeta(mtp);
    const pyqMeta = withMeta(pyq);
    const filteredRtp = filterByYearAndCourseAndSubject(rtpMeta, years, course, subject);
    const filteredMtp = filterByYearAndCourseAndSubject(mtpMeta, years, course, subject);
    const filteredPyq = filterByYearAndCourseAndSubject(pyqMeta, years, course, subject);
    const courses = [...new Set([...rtpMeta, ...mtpMeta, ...pyqMeta].map((x) => x.course).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    const subjects = [...new Set([...rtpMeta, ...mtpMeta, ...pyqMeta].map((x) => x.subject).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));

    return res.json({
      success: true,
      source: "ICAI",
      fetchedAt: new Date().toISOString(),
      years,
      course,
      subject,
      courses,
      subjects,
      rtp: filteredRtp,
      mtp: filteredMtp,
      pyq: filteredPyq,
      total: filteredRtp.length + filteredMtp.length + filteredPyq.length,
    });
  } catch (error) {
    console.error("icai resources error:", error.message || error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch ICAI resources right now.",
    });
  }
});

router.get("/proxy", async (req, res) => {
  const sourceUrl = String(req.query.url || "").trim();
  if (!sourceUrl) return res.status(400).json({ success: false, message: "Missing url" });
  if (!isAllowedSource(sourceUrl)) {
    return res.status(400).json({ success: false, message: "URL is not an allowed ICAI source" });
  }
  if (!isPdfUrl(sourceUrl)) {
    return res.status(400).json({ success: false, message: "Only PDF resources are allowed" });
  }

  try {
    const upstream = await axios.get(sourceUrl, {
      responseType: "stream",
      timeout: 45000,
      headers: {
        "User-Agent": "CA-Mentor/1.0",
        Accept: "application/pdf,text/html,*/*",
      },
    });

    const contentType = upstream.headers["content-type"] || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    const disp = contentType.includes("pdf") ? "inline" : "inline";
    res.setHeader("Content-Disposition", `${disp}; filename=icai-resource`);

    upstream.data.pipe(res);
  } catch (error) {
    console.error("icai proxy error:", error.message || error);
    return res.status(502).json({ success: false, message: "Failed to fetch ICAI file" });
  }
});

export default router;
