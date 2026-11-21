"use strict";

const DB_FILENAME = "koffia-db.json";
const ALLOWED_FIELDS = new Set([
  "orders",
  "customers",
  "vouchers",
  "flashSales",
  "sellers",
  "customProducts",
  "reviews",
  "addresses",
]);

function setNoCacheHeaders(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

function getDefaultDb() {
  return {
    orders: [],
    customers: { registered: [], overrides: {} },
    vouchers: [],
    flashSales: [],
    sellers: [],
    customProducts: [],
    reviews: {},
    addresses: {},
  };
}

async function readGistDb(gistId, token) {
  const response = await fetch(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Koffia-Vercel-DataCenter",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`GitHub Gist GET failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const gist = await response.json();
  const file = gist?.files?.[DB_FILENAME];
  let parsed = getDefaultDb();

  if (file && typeof file.content === "string" && file.content.trim()) {
    try {
      const json = JSON.parse(file.content);
      if (json && typeof json === "object") {
        parsed = { ...getDefaultDb(), ...json };
      }
    } catch {
      parsed = getDefaultDb();
    }
  }

  return {
    data: parsed,
    updatedAt: gist.updated_at || new Date().toISOString(),
  };
}

async function writeGistDb(gistId, token, nextData) {
  const response = await fetch(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "Koffia-Vercel-DataCenter",
    },
    body: JSON.stringify({
      files: {
        [DB_FILENAME]: {
          content: JSON.stringify(nextData, null, 2),
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`GitHub Gist PATCH failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const gist = await response.json();
  return gist.updated_at || new Date().toISOString();
}

module.exports = async function handler(req, res) {
  setNoCacheHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const token = (process.env.GITHUB_TOKEN || "").trim();
  const gistId = (process.env.GIST_ID || "").trim();

  if (!token || !gistId) {
    return res.status(200).json({
      ok: false,
      configured: false,
      message: "Chưa cấu hình GITHUB_TOKEN hoặc GIST_ID trong Vercel Environment Variables.",
    });
  }

  try {
    if (req.method === "GET") {
      const { data, updatedAt } = await readGistDb(gistId, token);
      return res.status(200).json({
        ok: true,
        configured: true,
        updatedAt,
        data,
      });
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          return res.status(400).json({ ok: false, error: "Invalid JSON body" });
        }
      }
      const patch = body && typeof body.patch === "object" ? body.patch : null;
      if (!patch) {
        return res.status(400).json({ ok: false, error: "Missing patch object" });
      }

      // Đọc bản mới nhất từ Gist rồi trộn theo từng khóa hợp lệ để tránh đè dữ liệu máy khác
      const { data: current } = await readGistDb(gistId, token);
      const merged = { ...current };

      Object.keys(patch).forEach((key) => {
        if (ALLOWED_FIELDS.has(key) && patch[key] !== undefined) {
          merged[key] = patch[key];
        }
      });

      const updatedAt = await writeGistDb(gistId, token, merged);
      return res.status(200).json({
        ok: true,
        configured: true,
        updatedAt,
        data: merged,
      });
    }

    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      configured: true,
      error: err.message || "Internal Server Error",
    });
  }
};
