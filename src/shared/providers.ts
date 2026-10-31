/**
 * 常见 OpenAI 兼容服务商预设：设置页选择后自动填入接口地址与推荐模型，
 * 并提供申请 API Key 的入口。用户仍可在此基础上手动修改，或选「自定义」。
 */

export type Provider = {
    id: string;
    name: string;
    baseUrl: string;
    model: string;
    /** 推荐的文本模型；无法获取模型列表时作为下拉候选。第一个与 model 相同。 */
    models: string[];
    /** 申请 / 管理 API Key 的页面；本地服务没有。 */
    keyUrl?: string;
    /** 是否需要 API Key（本地 Ollama 不需要，但接口仍要求非空，填任意值即可）。 */
    needsKey: boolean;
    hint: string;
};

export const PROVIDERS: Provider[] = [
    {
        id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat",
        models: ["deepseek-chat", "deepseek-reasoner"],
        keyUrl: "https://platform.deepseek.com/api_keys", needsKey: true,
        hint: "性价比高、中文效果好，推荐默认使用。翻译建议关闭思考模式。",
    },
    {
        id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini",
        models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
        keyUrl: "https://platform.openai.com/api-keys", needsKey: true,
        hint: "国内网络通常需要代理。",
    },
    {
        id: "moonshot", name: "Kimi（月之暗面）", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k",
        models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
        keyUrl: "https://platform.moonshot.cn/console/api-keys", needsKey: true,
        hint: "长文本能力强。",
    },
    {
        id: "qwen", name: "通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus",
        models: ["qwen-plus", "qwen-flash", "qwen-max", "qwen-long"],
        keyUrl: "https://bailian.console.aliyun.com/?apiKey=1", needsKey: true,
        hint: "阿里云百炼的 OpenAI 兼容模式。",
    },
    {
        id: "zhipu", name: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash",
        models: ["glm-4-flash", "glm-4-air", "glm-4-plus"],
        keyUrl: "https://open.bigmodel.cn/usercenter/apikeys", needsKey: true,
        hint: "glm-4-flash 有免费额度，适合轻度使用。",
    },
    {
        id: "ollama", name: "Ollama（本地）", baseUrl: "http://localhost:11434/v1", model: "qwen2.5:7b",
        models: ["qwen2.5:7b", "llama3.1:8b"],
        needsKey: false,
        hint: "数据不出本机。需先安装 Ollama 并拉取模型；API Key 填任意字符即可。",
    },
];

export const CUSTOM_PROVIDER_ID = "custom";

const normalize = (url: string): string => url.trim().replace(/\/+$/, "").toLowerCase();

/** 根据当前接口地址反查预设，用于打开设置页时回显所选服务商；匹配不到返回「自定义」。 */
export function detectProvider(baseUrl: string): string {
    const target = normalize(baseUrl);
    return PROVIDERS.find(p => normalize(p.baseUrl) === target)?.id ?? CUSTOM_PROVIDER_ID;
}

export function getProvider(id: string): Provider | undefined {
    return PROVIDERS.find(p => p.id === id);
}
