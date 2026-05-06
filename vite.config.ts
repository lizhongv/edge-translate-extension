import { defineConfig, type Plugin } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/manifest";
import { rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const tolerantClean = (): Plugin => ({
    name: "tolerant-clean-dist",
    apply: "build",
    buildStart() {
        const dist = "dist";
        if (!existsSync(dist)) return;
        for (const name of readdirSync(dist)) {
            if (name === "icons") continue;
            try {
                rmSync(join(dist, name), { recursive: true, force: true });
            } catch (e: unknown) {
                const code = (e as { code?: string }).code;
                if (code === "EPERM" || code === "EBUSY") continue;
                throw e;
            }
        }
    },
});

export default defineConfig({
    plugins: [tolerantClean(), crx({ manifest })],
    build: {
        outDir: "dist",
        emptyOutDir: false,
        sourcemap: true,
        rollupOptions: {
            input: {
                sidepanel: "src/sidepanel/index.html",
                options: "src/options/index.html",
            },
        },
    },
    server: {
        port: 5173,
        strictPort: true,
        hmr: { port: 5174 },
    },
});
