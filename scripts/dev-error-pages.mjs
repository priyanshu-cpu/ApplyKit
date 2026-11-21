import { readFile } from "node:fs/promises";
import { errorPages, renderErrorDocument } from "../src/config/error-pages.ts";

// Astro and Vite can reject a request before their page middleware runs.
// Format document errors at the HTTP boundary while retaining the status and headers.
export const devErrors = {
  name: "applykit-dev-errors",
  hooks: {
    "astro:server:setup": async ({ server }) => {
      const template = await readFile(new URL("../src/components/error-document.html", import.meta.url), "utf8");
      server.httpServer?.prependListener("request", (req, res) => {
        if (!req.headers.accept?.includes("text/html")) return;
        const { writeHead, write, end } = res;
        let replacement;
        res.writeHead = function (status, ...args) {
          if (!(status in errorPages)) return writeHead.call(this, status, ...args);
          replacement = Buffer.from(renderErrorDocument(template, status));
          const supplied = args.find(value => value && typeof value === "object");
          if (Array.isArray(supplied)) {
            for (let i = 0; i < supplied.length; i += 2) this.setHeader(supplied[i], supplied[i + 1]);
          } else {
            for (const [key, value] of Object.entries(supplied ?? {})) this.setHeader(key, value);
          }
          for (const key of ["Content-Encoding", "Transfer-Encoding", "ETag"]) this.removeHeader(key);
          this.setHeader("Content-Type", "text/html; charset=utf-8");
          this.setHeader("Content-Length", replacement.length);
          this.setHeader("Cache-Control", "no-store");
          return writeHead.call(this, status);
        };
        res.write = function (...args) {
          if (!this.headersSent && this.statusCode in errorPages) this.writeHead(this.statusCode);
          if (!replacement) return write.apply(this, args);
          const callback = args.find(arg => typeof arg === "function");
          if (callback) queueMicrotask(callback);
          return true;
        };
        res.end = function (...args) {
          if (!this.headersSent && this.statusCode in errorPages) this.writeHead(this.statusCode);
          if (!replacement) return end.apply(this, args);
          return end.call(this, req.method === "HEAD" ? undefined : replacement, args.find(arg => typeof arg === "function"));
        };
      });
    },
  },
};
