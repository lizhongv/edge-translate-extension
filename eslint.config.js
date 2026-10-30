// ESLint 配置：JS 推荐规则 + typescript-eslint 推荐规则，浏览器扩展环境。
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
    { ignores: ["dist/", "coverage/", "node_modules/"] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["src/**/*.ts", "tests/**/*.ts", "*.ts"],
        languageOptions: {
            globals: { ...globals.browser, ...globals.webextensions, ...globals.node },
        },
        rules: {
            // 以下划线开头的参数 / 变量表示有意不用（如解构剔除字段）
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
            // 空 catch 用于「失败可忽略」的场景（如剪贴板、通知），要求写注释说明
            "no-empty": ["error", { allowEmptyCatch: true }],
            eqeqeq: ["error", "always"],
            "prefer-const": "error",
        },
    },
    {
        // 测试中模拟 chrome.* 与流式接口需要 any，并用不 yield 的生成器模拟异常路径
        files: ["tests/**/*.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "require-yield": "off",
        },
    },
);
