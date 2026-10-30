/**
 * 产品标识与对外链接。界面文案、日志前缀、右键菜单 ID 统一从这里取，
 * 更名或换仓库地址时只改这一处。
 */

export const APP_NAME = "划词译问";
export const APP_NAME_EN = "SelectLingo";

/** 控制台日志前缀，便于在页面控制台中筛选本扩展的输出。 */
export const LOG_PREFIX = `[${APP_NAME}]`;

/** 右键菜单 ID；改动后旧 ID 会在 onInstalled 时被 removeAll 清理。 */
export const MENU_IDS = {
    translate: "selectlingo-translate",
    qa: "selectlingo-qa",
    memo: "selectlingo-memo",
} as const;

const REPO = "https://github.com/lizhongv/edge-translate-extension";

export const LINKS = {
    repo: REPO,
    issues: `${REPO}/issues`,
    privacy: `${REPO}/blob/main/PRIVACY.md`,
    changelog: `${REPO}/blob/main/CHANGELOG.md`,
} as const;
