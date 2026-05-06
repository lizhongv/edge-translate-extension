import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/manifest";

export default defineConfig({
    plugins: [crx({ manifest })],
    build: {
        outDir: "dist",
        emptyOutDir: true,
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
