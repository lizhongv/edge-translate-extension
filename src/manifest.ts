import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "../package.json" with { type: "json" };

/**
 * 扩展清单。名称、描述、按钮提示走 _locales（public/_locales），
 * 浏览器按界面语言显示「划词译问」或「SelectLingo」。
 */
export default defineManifest({
    manifest_version: 3,
    name: "__MSG_appName__",
    short_name: "__MSG_appShortName__",
    version: pkg.version,
    description: "__MSG_appDescription__",
    default_locale: "zh_CN",
    homepage_url: "https://github.com/lizhongv/edge-translate-extension",
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
            all_frames: true,
        },
    ],
    side_panel: {
        default_path: "src/sidepanel/index.html",
    },
    options_page: "src/options/index.html",
    action: {
        default_title: "__MSG_actionTitle__",
        default_icon: {
            16: "icons/16.png",
            32: "icons/32.png",
        },
    },
    commands: {
        translate: {
            suggested_key: { default: "Alt+T" },
            description: "__MSG_cmdTranslate__",
        },
        qa: {
            description: "__MSG_cmdQA__",
        },
    },
    icons: {
        16: "icons/16.png",
        32: "icons/32.png",
        48: "icons/48.png",
        128: "icons/128.png",
    },
});
