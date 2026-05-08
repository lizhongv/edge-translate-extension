import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "../package.json" with { type: "json" };

export default defineManifest({
    manifest_version: 3,
    name: "工具插件",
    version: pkg.version,
    description: "划词翻译 / 问答 / 备忘录 一体化网页工具",
    permissions: [
        "contextMenus",
        "storage",
        "sidePanel",
        "notifications",
        "activeTab",
        "scripting",
    ],
    host_permissions: ["<all_urls>"],
    background: {
        service_worker: "src/background/service-worker.ts",
        type: "module",
    },
    content_scripts: [
        {
            matches: ["<all_urls>"],
            js: ["src/content/index.ts"],
            run_at: "document_idle",
        },
    ],
    side_panel: {
        default_path: "src/sidepanel/index.html",
    },
    options_page: "src/options/index.html",
    action: {
        default_title: "工具插件 - 打开历史",
    },
    commands: {
        translate: {
            suggested_key: { default: "Alt+T" },
            description: "翻译当前选中文本",
        },
        qa: {
            description: "问答当前选中文本（在 edge://extensions/shortcuts 设置快捷键）",
        },
    },
    icons: {
        16: "icons/16.png",
        32: "icons/32.png",
        48: "icons/48.png",
        128: "icons/128.png",
    },
});
