const CJK_RANGE = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/;
const COUNTABLE = /[^\s\p{P}]/u;

export function detectChineseRatio(text: string): number {
    if (text.length === 0) return 0;
    let cjk = 0;
    let total = 0;
    for (const ch of text) {
        if (!COUNTABLE.test(ch)) continue;
        total++;
        if (CJK_RANGE.test(ch)) cjk++;
    }
    if (total === 0) return 0;
    return cjk / total;
}

export function isChineseDominant(text: string): boolean {
    return detectChineseRatio(text) > 0.5;
}
