import express from "express";
import axios from "axios";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

const makeSearchUrl = (query) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
const makeEmbedSearchUrl = (query) => `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query)}`;
const makePlaylistUrl = (playlistId) => `https://www.youtube.com/playlist?list=${playlistId}`;
const makeEmbedPlaylistUrl = (playlistId) => `https://www.youtube.com/embed/videoseries?list=${playlistId}`;
const PLAYLIST_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const playlistCache = new Map();

const PW = "Physics Wallah";
const PW_CA = "Physics Wallah CA Wallah";

const videoCatalog = [
  { id: "v-fnd-acc-1", level: "Foundation", subject: "Accounting", title: "CA Foundation Accounting Full Course", channel: PW_CA, query: `${PW} CA Foundation Accounting full course` },
  { id: "v-fnd-law-1", level: "Foundation", subject: "Law", title: "CA Foundation Business Law Full Course", channel: PW_CA, query: `${PW} CA Foundation Business Law full course` },
  { id: "v-fnd-math-1", level: "Foundation", subject: "Maths", title: "CA Foundation Maths & Statistics Full Course", channel: PW_CA, query: `${PW} CA Foundation Maths Statistics full course` },
  { id: "v-fnd-eco-1", level: "Foundation", subject: "Economics", title: "CA Foundation Economics Full Course", channel: PW_CA, query: `${PW} CA Foundation Economics full course` },

  { id: "v-int-acc-1", level: "Intermediate", subject: "Accounting", title: "CA Intermediate Advanced Accounting Full Course", channel: PW_CA, query: `${PW} CA Intermediate Advanced Accounting full course` },
  { id: "v-int-law-1", level: "Intermediate", subject: "Law", title: "CA Intermediate Corporate and Other Laws Full Course", channel: PW_CA, query: `${PW} CA Intermediate Corporate and Other Laws full course` },
  { id: "v-int-tax-1", level: "Intermediate", subject: "Taxation", title: "CA Intermediate Taxation Full Course", channel: PW_CA, query: `${PW} CA Intermediate Taxation full course` },
  { id: "v-int-cost-1", level: "Intermediate", subject: "Costing", title: "CA Intermediate Cost and Management Accounting", channel: PW_CA, query: `${PW} CA Intermediate Cost and Management Accounting full course` },
  { id: "v-int-audit-1", level: "Intermediate", subject: "Audit", title: "CA Intermediate Auditing Full Course", channel: PW_CA, query: `${PW} CA Intermediate Auditing full course` },
  { id: "v-int-fmsm-1", level: "Intermediate", subject: "FM & SM", title: "CA Intermediate FM SM Full Course", channel: PW_CA, query: `${PW} CA Intermediate FM SM full course` },

  { id: "v-fin-fr-1", level: "Final", subject: "Financial Reporting", title: "CA Final Financial Reporting Full Course", channel: PW_CA, query: `${PW} CA Final Financial Reporting full course` },
  { id: "v-fin-sfm-1", level: "Final", subject: "SFM", title: "CA Final SFM Full Course", channel: PW_CA, query: `${PW} CA Final SFM full course` },
  { id: "v-fin-audit-1", level: "Final", subject: "Audit", title: "CA Final Audit Full Course", channel: PW_CA, query: `${PW} CA Final Audit full course` },
  { id: "v-fin-tax-1", level: "Final", subject: "Taxation", title: "CA Final Direct + Indirect Tax Full Course", channel: PW_CA, query: `${PW} CA Final Direct Tax Indirect Tax full course` },
  { id: "v-fin-ibs-1", level: "Final", subject: "IBS", title: "CA Final IBS / Multidisciplinary Case Study", channel: PW_CA, query: `${PW} CA Final IBS multidisciplinary case study` },
];

const parseFirstPlaylistId = (html = "") => {
  const m = html.match(/"playlistId":"(PL[^"]+)"/);
  return m ? m[1] : null;
};

const resolvePlaylistForQuery = async (query) => {
  const cached = playlistCache.get(query);
  if (cached && Date.now() - cached.at < PLAYLIST_CACHE_TTL_MS) return cached.value;

  try {
    const searchUrl = `${makeSearchUrl(query)}&sp=EgIQAw%253D%253D`;
    const { data } = await axios.get(searchUrl, {
      timeout: 25000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const html = String(data || "");
    const playlistId = parseFirstPlaylistId(html);
    const value = playlistId
      ? { playlistId, url: makePlaylistUrl(playlistId), embedUrl: makeEmbedPlaylistUrl(playlistId), source: "playlist" }
      : { playlistId: null, url: makeSearchUrl(query), embedUrl: makeEmbedSearchUrl(query), source: "search-fallback" };

    playlistCache.set(query, { at: Date.now(), value });
    return value;
  } catch {
    const value = { playlistId: null, url: makeSearchUrl(query), embedUrl: makeEmbedSearchUrl(query), source: "search-fallback" };
    playlistCache.set(query, { at: Date.now(), value });
    return value;
  }
};

router.get("/", authMiddleware, async (req, res) => {
  const level = String(req.query.level || "All");
  const subject = String(req.query.subject || "All");
  const q = String(req.query.q || "").trim().toLowerCase();

  const rows = videoCatalog
    .filter((v) => (level === "All" || v.level === level))
    .filter((v) => (subject === "All" || v.subject === subject))
    .filter((v) => {
      if (!q) return true;
      const hay = `${v.title} ${v.subject} ${v.level} ${v.query}`.toLowerCase();
      return hay.includes(q);
    });

  const resolved = await Promise.all(
    rows.map(async (v) => {
      const p = await resolvePlaylistForQuery(v.query);
      return {
        ...v,
        platform: "YouTube",
        courseType: "Free",
        url: p.url,
        embedUrl: p.embedUrl,
        playlistId: p.playlistId,
        linkType: p.source === "playlist" ? "playlist" : "search-fallback",
      };
    })
  );

  const subjects = [...new Set(videoCatalog.filter((v) => level === "All" || v.level === level).map((v) => v.subject))];

  return res.json({
    success: true,
    level,
    subject,
    subjects,
    videos: resolved,
  });
});

export default router;
