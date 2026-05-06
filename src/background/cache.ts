import { readCache, writeCache } from "../shared/storage";

const encoder = new TextEncoder();

export async function computeCacheKey(text: string, target: string, model: string): Promise<string> {
    const data = encoder.encode(`${model} ${target} ${text}`);
    const buf = await crypto.subtle.digest("SHA-1", data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function getCachedTranslation(text: string, target: string, model: string): Promise<string | undefined> {
    const key = await computeCacheKey(text, target, model);
    return readCache(key);
}

export async function setCachedTranslation(text: string, target: string, model: string, value: string): Promise<void> {
    const key = await computeCacheKey(text, target, model);
    await writeCache(key, value);
}
