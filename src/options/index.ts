import { getSettings, setSettings } from "../shared/storage";
import { stream } from "../background/llm-client";
import type { Settings } from "../shared/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const inputs = {
    baseUrl: $<HTMLInputElement>("baseUrl"),
    apiKey: $<HTMLInputElement>("apiKey"),
    model: $<HTMLInputElement>("model"),
    temperature: $<HTMLInputElement>("temperature"),
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
};

function fillForm(s: Settings): void {
    inputs.baseUrl.value = s.baseUrl;
    inputs.apiKey.value = s.apiKey;
    inputs.model.value = s.model;
    inputs.temperature.value = String(s.temperature);
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
}

function readForm(): Partial<Settings> {
    let headers: Record<string, string> = {};
    try {
        const v = inputs.customHeaders.value.trim();
        headers = v ? JSON.parse(v) : {};
    } catch {
        throw new Error("自定义请求头不是合法 JSON");
    }
    return {
        baseUrl: inputs.baseUrl.value.trim(),
        apiKey: inputs.apiKey.value,
        model: inputs.model.value.trim(),
        temperature: Number(inputs.temperature.value) || 0.2,
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
    };
}

$<HTMLButtonElement>("save").addEventListener("click", async () => {
    const result = $<HTMLSpanElement>("saveResult");
    try {
        const patch = readForm();
        await setSettings(patch);
        result.textContent = "已保存";
    } catch (e) {
        result.textContent = (e as Error).message;
    }
});

$<HTMLButtonElement>("testConn").addEventListener("click", async () => {
    const result = $<HTMLSpanElement>("testResult");
    result.textContent = "测试中…";
    try {
        const patch = readForm();
        const settings: Settings = { ...(await getSettings()), ...patch };
        const t0 = performance.now();
        const ctrl = new AbortController();
        let token = "";
        for await (const t of stream({ kind: "translate", text: "hi", target: "中文" }, settings, ctrl.signal)) {
            token += t;
            if (token.length > 4) {
                ctrl.abort();
                break;
            }
        }
        const dt = Math.round(performance.now() - t0);
        result.textContent = `✅ ${settings.model} 响应正常 (${dt}ms)`;
    } catch (e) {
        const err = e as { code?: string; message?: string };
        result.textContent = `❌ ${err.message ?? "未知错误"}`;
    }
});

void (async () => {
    console.time("[翻译插件] options getSettings");
    const s = await getSettings();
    console.timeEnd("[翻译插件] options getSettings");
    fillForm(s);
    console.log("[翻译插件] options 表单已填充");
})();
