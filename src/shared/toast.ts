import toastCss from "./toast.css?inline";

type ToastOptions = {
    actionLabel?: string;
    onAction?: () => void;
    durationMs?: number;
};

let currentHost: HTMLDivElement | null = null;
let currentTimer: ReturnType<typeof setTimeout> | null = null;

function _clear(): void {
    if (currentTimer !== null) {
        clearTimeout(currentTimer);
        currentTimer = null;
    }
    if (currentHost?.parentNode) {
        currentHost.parentNode.removeChild(currentHost);
    }
    currentHost = null;
    (window as unknown as { __lastToastRoot?: ShadowRoot | undefined }).__lastToastRoot = undefined;
}

export function showToast(message: string, options: ToastOptions = {}): void {
    _clear();

    const host = document.createElement("div");
    host.style.all = "initial";
    const root = host.attachShadow({ mode: "closed" });
    (window as unknown as { __lastToastRoot?: ShadowRoot }).__lastToastRoot = root;

    const style = document.createElement("style");
    style.textContent = toastCss;
    root.appendChild(style);

    const toast = document.createElement("div");
    toast.className = "toast";

    const msgEl = document.createElement("span");
    msgEl.className = "msg";
    msgEl.textContent = message;
    toast.appendChild(msgEl);

    if (options.actionLabel) {
        const btn = document.createElement("button");
        btn.className = "action";
        btn.type = "button";
        btn.textContent = options.actionLabel;
        btn.addEventListener("click", () => {
            options.onAction?.();
            _clear();
        });
        toast.appendChild(btn);
    }

    root.appendChild(toast);
    document.body.appendChild(host);
    currentHost = host;

    requestAnimationFrame(() => toast.classList.add("shown"));

    const duration = options.durationMs ?? 2000;
    currentTimer = setTimeout(() => _clear(), duration);
}

// Test-only: force-clear without timer
export function _hideToastForTest(): void {
    _clear();
}
