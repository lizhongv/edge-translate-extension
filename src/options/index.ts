/**
 * 设置页：表单读写、服务商预设、连接测试、未保存提醒、首次安装欢迎引导、导航联动。
 * 表单字段与 Settings 一一对应，读写只经过 fillForm / readForm 两个函数。
 */
import { getSettings, setSettings } from "../shared/storage";
import { stream } from "../background/llm-client";
import { LINKS } from "../shared/constants";
import { CUSTOM_PROVIDER_ID, PROVIDERS, detectProvider, getProvider } from "../shared/providers";
import type { Settings } from "../shared/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const inputs = {
    baseUrl: $<HTMLInputElement>("baseUrl"),
    apiKey: $<HTMLInputElement>("apiKey"),
    model: $<HTMLInputElement>("model"),
    temperature: $<HTMLInputElement>("temperature"),
    thinkingMode: $<HTMLSelectElement>("thinkingMode"),
    systemPrompt: $<HTMLTextAreaElement>("systemPrompt"),
    customHeaders: $<HTMLTextAreaElement>("customHeaders"),
    primaryTarget: $<HTMLInputElement>("primaryTarget"),
    secondaryTarget: $<HTMLInputElement>("secondaryTarget"),
    longTextThreshold: $<HTMLInputElement>("longTextThreshold"),
    historyLimit: $<HTMLInputElement>("historyLimit"),
    enableHoverButton: $<HTMLInputElement>("enableHoverButton"),
    enableQA: $<HTMLInputElement>("enableQA"),
    qaSystemPrompt: $<HTMLTextAreaElement>("qaSystemPrompt"),
    qaMaxTurns: $<HTMLInputElement>("qaMaxTurns"),
    enableMemo: $<HTMLInputElement>("enableMemo"),
    enableSettingsButton: $<HTMLInputElement>("enableSettingsButton"),
    forceSelectable: $<HTMLInputElement>("forceSelectable"),
};

const saveBtn = $<HTMLButtonElement>("save");
const saveResult = $<HTMLSpanElement>("saveResult");
const testBtn = $<HTMLButtonElement>("testConn");
const testResult = $<HTMLSpanElement>("testResult");
const dirtyHint = $<HTMLSpanElement>("dirtyHint");
const providerGrid = $<HTMLDivElement>("providerGrid");
const providerHint = $<HTMLParagraphElement>("providerHint");
const keyLink = $<HTMLAnchorElement>("keyLink");

// ===== 表单读写 =====
function fillForm(s: Settings): void {
    inputs.baseUrl.value = s.baseUrl;
    inputs.apiKey.value = s.apiKey;
    inputs.model.value = s.model;
    inputs.temperature.value = String(s.temperature);
    inputs.thinkingMode.value = s.thinkingMode;
    inputs.systemPrompt.value = s.systemPrompt;
    inputs.customHeaders.value = JSON.stringify(s.customHeaders, null, 2);
    inputs.primaryTarget.value = s.primaryTarget;
    inputs.secondaryTarget.value = s.secondaryTarget;
    inputs.longTextThreshold.value = String(s.longTextThreshold);
    inputs.historyLimit.value = String(s.historyLimit);
    inputs.enableHoverButton.checked = s.enableHoverButton;
    inputs.enableQA.checked = s.enableQA;
    inputs.qaSystemPrompt.value = s.qaSystemPrompt;
    inputs.qaMaxTurns.value = String(s.qaMaxTurns);
    inputs.enableMemo.checked = s.enableMemo;
    inputs.enableSettingsButton.checked = s.enableSettingsButton;
    inputs.forceSelectable.checked = s.forceSelectable;
}

function readForm(): Partial<Settings> {
    let headers: Record<string, string>;
    try {
        const v = inputs.customHeaders.value.trim();
        headers = v ? JSON.parse(v) : {};
    } catch {
        throw new Error("自定义请求头不是合法的 JSON");
    }
    return {
        baseUrl: inputs.baseUrl.value.trim(),
        apiKey: inputs.apiKey.value.trim(),
        model: inputs.model.value.trim(),
        temperature: Number(inputs.temperature.value) || 0.2,
        thinkingMode: inputs.thinkingMode.value as Settings["thinkingMode"],
        systemPrompt: inputs.systemPrompt.value,
        customHeaders: headers,
        primaryTarget: inputs.primaryTarget.value.trim(),
        secondaryTarget: inputs.secondaryTarget.value.trim(),
        longTextThreshold: Math.max(100, Number(inputs.longTextThreshold.value) || 5000),
        historyLimit: Math.max(10, Number(inputs.historyLimit.value) || 200),
        enableHoverButton: inputs.enableHoverButton.checked,
        enableQA: inputs.enableQA.checked,
        qaSystemPrompt: inputs.qaSystemPrompt.value,
        qaMaxTurns: Math.min(20, Math.max(1, Number(inputs.qaMaxTurns.value) || 6)),
        enableMemo: inputs.enableMemo.checked,
        enableSettingsButton: inputs.enableSettingsButton.checked,
        forceSelectable: inputs.forceSelectable.checked,
    };
}

// ===== 状态提示 =====
type Tone = "ok" | "err" | "busy" | "";
function setStatus(el: HTMLElement, text: string, tone: Tone): void {
    el.textContent = text;
    el.className = `status ${tone}`.trim();
}

let dirty = false;
function setDirty(v: boolean): void {
    dirty = v;
    dirtyHint.hidden = !v;
    if (v) setStatus(saveResult, "", "");
}

// ===== 服务商预设 =====
function renderProviders(): void {
    const items = [...PROVIDERS, { id: CUSTOM_PROVIDER_ID, name: "自定义", baseUrl: "任意 OpenAI 兼容接口" }];
    for (const p of items) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "provider";
        btn.dataset.id = p.id;
        btn.setAttribute("role", "radio");
        const name = document.createElement("b");
        name.textContent = p.name;
        const url = document.createElement("small");
        url.textContent = p.baseUrl.replace(/^https?:\/\//, "");
        btn.append(name, url);
        btn.addEventListener("click", () => selectProvider(p.id, true));
        providerGrid.appendChild(btn);
    }
}

/** fill 为 true 时用预设覆盖接口地址与模型（用户点选）；为 false 只更新高亮与提示（回显）。 */
function selectProvider(id: string, fill: boolean): void {
    providerGrid.querySelectorAll<HTMLButtonElement>(".provider").forEach(b => {
        b.setAttribute("aria-checked", String(b.dataset.id === id));
    });
    const p = getProvider(id);
    if (!p) {
        providerHint.textContent = "填写任意 OpenAI 兼容接口的地址与模型名。";
        keyLink.hidden = true;
        return;
    }
    providerHint.textContent = p.hint;
    keyLink.hidden = !p.keyUrl;
    if (p.keyUrl) keyLink.href = p.keyUrl;
    if (fill) {
        inputs.baseUrl.value = p.baseUrl;
        inputs.model.value = p.model;
        if (!p.needsKey && !inputs.apiKey.value) inputs.apiKey.value = "ollama";
        setDirty(true);
        setStatus(testResult, "", "");
    }
}

inputs.baseUrl.addEventListener("input", () => selectProvider(detectProvider(inputs.baseUrl.value), false));

$<HTMLButtonElement>("toggleKey").addEventListener("click", (e) => {
    const show = inputs.apiKey.type === "password";
    inputs.apiKey.type = show ? "text" : "password";
    (e.currentTarget as HTMLButtonElement).textContent = show ? "隐藏" : "显示";
});

// ===== 保存 =====
async function save(): Promise<void> {
    try {
        await setSettings(readForm());
        setDirty(false);
        setStatus(saveResult, "✓ 已保存", "ok");
        if (inputs.apiKey.value) $<HTMLElement>("welcome").hidden = true;   // 配置完成后收起引导
    } catch (e) {
        setStatus(saveResult, (e as Error).message, "err");
    }
}

saveBtn.addEventListener("click", () => void save());
document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
    }
});
document.querySelector("main")?.addEventListener("input", (e) => {
    if ((e.target as HTMLElement).matches("input, textarea, select")) setDirty(true);
});
window.addEventListener("beforeunload", (e) => {
    if (dirty) e.preventDefault();
});

// ===== 测试连接 =====
testBtn.addEventListener("click", async () => {
    testBtn.disabled = true;
    setStatus(testResult, "正在连接…", "busy");
    try {
        const settings: Settings = { ...(await getSettings()), ...readForm() };
        const t0 = performance.now();
        const ctrl = new AbortController();
        let token = "";
        let sawReasoning = false;
        for await (const c of stream({ kind: "translate", text: "hi", target: "中文" }, settings, ctrl.signal)) {
            if (c.type === "reasoning") {
                sawReasoning = true;
                setStatus(testResult, "模型思考中…", "busy");
                continue;
            }
            token += c.text;
            if (token.length > 4) {
                ctrl.abort();
                break;
            }
        }
        const dt = Math.round(performance.now() - t0);
        const thinkNote = sawReasoning ? "，思考模式已开启" : "";
        setStatus(testResult, `✓ 连接正常：${settings.model}，首字 ${dt} ms${thinkNote}`, "ok");
    } catch (e) {
        const err = e as { message?: string };
        setStatus(testResult, `✕ ${err.message ?? "未知错误"}`, "err");
    } finally {
        testBtn.disabled = false;
    }
});

// ===== 快捷键、关于 =====
$<HTMLButtonElement>("openShortcuts").addEventListener("click", () => {
    void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});
$<HTMLElement>("version").textContent = `v${chrome.runtime.getManifest().version}`;
$<HTMLAnchorElement>("lnkPrivacy").href = LINKS.privacy;
$<HTMLAnchorElement>("lnkChangelog").href = LINKS.changelog;
$<HTMLAnchorElement>("lnkIssues").href = LINKS.issues;
$<HTMLAnchorElement>("lnkRepo").href = LINKS.repo;

// ===== 导航随滚动高亮 =====
const navLinks = [...document.querySelectorAll<HTMLAnchorElement>(".nav a")];
const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        navLinks.forEach(a => a.classList.toggle("active", a.getAttribute("href") === `#${entry.target.id}`));
    }
}, { rootMargin: "-20% 0px -70% 0px" });
document.querySelectorAll("main .card").forEach(sec => observer.observe(sec));

// ===== 初始化 =====
void (async () => {
    renderProviders();
    const s = await getSettings();
    fillForm(s);
    selectProvider(detectProvider(s.baseUrl), false);
    // 首次安装（#welcome）或尚未配置 API Key 时显示欢迎引导
    if (location.hash === "#welcome" || !s.apiKey) {
        $<HTMLElement>("welcome").hidden = false;
        if (!s.apiKey) inputs.apiKey.focus();
    }
    setDirty(false);
})();
