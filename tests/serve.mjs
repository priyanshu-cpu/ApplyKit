// Serve the exact static output with its deployment headers during browser QA.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const root = resolve("dist");
const fileTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};
const configured = await readFile(resolve(root, "_headers"), "utf8");
const headers = Object.fromEntries(
  configured
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line.startsWith("  ") && !line.includes("Cache-Control"))
    .map((line) => {
      const split = line.indexOf(":");
      return [line.slice(0, split).trim(), line.slice(split + 1).trim()];
    }),
);
async function sendError(res, code) {
  const path = code === 404 ? "404.html" : `errors/${code}/index.html`;
  const body = await readFile(resolve(root, path)).catch(() => `Error ${code}`);
  res.writeHead(code, { ...headers, "Content-Type": fileTypes[".html"], "Cache-Control": "no-store" }).end(body);
}
createServer(async (req, res) => {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
  } catch {
    return sendError(res, 400);
  }
  if (path.includes("\0")) return sendError(res, 400);
  if (path.endsWith("/")) path += "index.html";
  const target = resolve(root, "." + path);
  if (!target.startsWith(root + sep) || path.endsWith("/_headers")) {
    return sendError(res, 403);
  }
  if (path === "/404.html") return sendError(res, 404);
  const errorPath = path.match(/^\/errors\/(400|403|429|500|502|503|504)\/index\.html$/);
  if (errorPath) return sendError(res, Number(errorPath[1]));
  try {
    const file = await readFile(target);
    res
      .writeHead(200, {
        ...headers,
        "Content-Type":
          fileTypes[extname(target)] || "application/octet-stream",
        ...(path.startsWith("/_astro/")
          ? { "Cache-Control": "public, max-age=31536000, immutable" }
          : {}),
      })
      .end(file);
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "EISDIR"].includes(error.code)) return sendError(res, 404);
    return sendError(res, error.code === "EACCES" ? 403 : 500);
  }
}).listen(Number(process.env.APPLYKIT_TEST_PORT || 4322), "127.0.0.1");
