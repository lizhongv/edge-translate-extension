import { describe, it, expect } from "vitest";
import { buildMemosMarkdown } from "../../src/sidepanel/index";
import type { Memo } from "../../src/shared/types";

const mk = (id: string, title: string, content: string): Memo => ({
    id,
    title,
    content,
    source: "selection",
    createdAt: 0,
    updatedAt: 0,
});

describe("buildMemosMarkdown", () => {
    it("returns empty string for empty array", () => {
        expect(buildMemosMarkdown([])).toBe("");
    });

    it("renders single memo with trailing separator", () => {
        const md = buildMemosMarkdown([mk("a", "Title", "Body line")]);
        expect(md).toBe("# Title\n\nBody line\n\n---\n");
    });

    it("renders multiple memos with separators between and after", () => {
        const md = buildMemosMarkdown([
            mk("a", "First", "Content1"),
            mk("b", "Second", "Content2"),
        ]);
        expect(md).toBe("# First\n\nContent1\n\n---\n\n# Second\n\nContent2\n\n---\n");
    });

    it("preserves multi-line content as-is", () => {
        const md = buildMemosMarkdown([mk("a", "T", "line1\nline2\nline3")]);
        expect(md).toBe("# T\n\nline1\nline2\nline3\n\n---\n");
    });

    it("does not escape special markdown characters in title or content", () => {
        const md = buildMemosMarkdown([mk("a", "# 标题 *bold*", "**body** [link](x)")]);
        expect(md).toBe("# # 标题 *bold*\n\n**body** [link](x)\n\n---\n");
    });
});
