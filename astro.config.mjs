import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwind from "@tailwindcss/vite";
import { loadEnv } from "vite";
import { cp, mkdir, readFile } from "node:fs/promises";

const env = loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "");
const site = process.env.SITE_URL || env.SITE_URL;
const pdfAssets = ["cmaps", "standard_fonts", "wasm", "iccs"];
const pdfLocal = {
  name: "applykit-pdf-assets",
  hooks: {
    "astro:server:setup": ({ server }) => {
      server.middlewares.use("/pdf-assets", async (req, res, next) => {
        const path = req.url?.split("?")[0] || "";
        if (!/^\/(cmaps|standard_fonts|wasm|iccs)\/[\w][\w.-]*$/.test(path))
          return next();
        try {
          const data = await readFile(new URL("node_modules/pdfjs-dist" + path, import.meta.url));
          const type = path.endsWith(".wasm") ? "application/wasm"
            : /\.m?js$/.test(path) ? "text/javascript"
            : "application/octet-stream";
          res.setHeader("Content-Type", type);
          res.setHeader("Content-Length", data.length);
          res.end(req.method === "HEAD" ? undefined : data);
        } catch (error) {
          if (error.code === "ENOENT") next();
          else next(error);
        }
      });
    },
    "astro:build:done": async ({ dir }) => {
      await mkdir(new URL("pdf-assets/", dir), { recursive: true });
      await Promise.all(
        pdfAssets.map(async (name) => {
          try {
            await cp(
              new URL("node_modules/pdfjs-dist/" + name + "/", import.meta.url),
              new URL("pdf-assets/" + name + "/", dir),
              { recursive: true },
            );
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
        }),
      );
    },
  },
};

export default defineConfig({
  site: site || undefined,
  output: "static",
  trailingSlash: "always",
  devToolbar: { enabled: false },
  integrations: [
    react(),
    ...(site ? [sitemap({ filter: (page) => !page.endsWith("/404/") })] : []),
    pdfLocal,
  ],
  vite: { plugins: [tailwind()] },
});
