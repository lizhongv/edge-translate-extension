/**
 * 可输入的下拉框：在普通 <input> 下方弹出候选列表。
 *
 * 不用原生 <datalist>：它会按输入框当前值过滤，已填 "deepseek-chat" 时只能看到一项，
 * 用户无法浏览完整列表。这里点箭头按钮展示全部候选，键入时再按子串过滤。
 * 输入框始终可自由输入，列表里没有的模型名也能直接填写。
 */

export type ComboboxOptions = {
    input: HTMLInputElement;
    /** 箭头按钮：点击展开全部候选 */
    toggle: HTMLButtonElement;
    /** 候选为空时列表中显示的提示 */
    emptyText: string;
    /** 选中某项后回调（用于标记未保存） */
    onPick?: (value: string) => void;
};

export type Combobox = {
    setItems(items: string[]): void;
};

let seq = 0;

export function createCombobox(opts: ComboboxOptions): Combobox {
    const { input, toggle, emptyText, onPick } = opts;
    const listId = `combo-list-${++seq}`;
    const list = document.createElement("ul");
    list.id = listId;
    list.className = "combo-list";
    list.setAttribute("role", "listbox");
    list.hidden = true;
    // 列表挂在输入框所在的定位容器内，随输入框一起滚动
    (input.closest(".combo") ?? input.parentElement!).appendChild(list);

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", listId);
    input.setAttribute("aria-expanded", "false");

    let items: string[] = [];
    let shown: string[] = [];
    let active = -1;

    function render(filter: string): void {
        const q = filter.trim().toLowerCase();
        shown = q ? items.filter(i => i.toLowerCase().includes(q)) : items;
        list.replaceChildren();
        if (shown.length === 0) {
            const li = document.createElement("li");
            li.className = "combo-empty";
            li.textContent = q && items.length ? "没有匹配的模型，可直接使用输入的名称" : emptyText;
            list.appendChild(li);
        }
        shown.forEach((value, i) => {
            const li = document.createElement("li");
            li.className = "combo-item";
            li.id = `${listId}-${i}`;
            li.setAttribute("role", "option");
            li.textContent = value;
            if (value === input.value.trim()) li.setAttribute("aria-selected", "true");
            // mousedown 而非 click：避免输入框先失焦导致列表关闭、点击落空
            li.addEventListener("mousedown", (e) => {
                e.preventDefault();
                pick(value);
            });
            list.appendChild(li);
        });
        setActive(-1);
    }

    function setActive(i: number): void {
        active = i;
        list.querySelectorAll(".combo-item").forEach((el, idx) => el.classList.toggle("active", idx === i));
        if (i >= 0) {
            const el = list.children[i] as HTMLElement | undefined;
            el?.scrollIntoView({ block: "nearest" });
            input.setAttribute("aria-activedescendant", `${listId}-${i}`);
        } else {
            input.removeAttribute("aria-activedescendant");
        }
    }

    function open(filter: string): void {
        render(filter);
        list.hidden = false;
        input.setAttribute("aria-expanded", "true");
        // 打开时把当前值滚动到可见位置
        const selected = list.querySelector<HTMLElement>("[aria-selected='true']");
        selected?.scrollIntoView({ block: "nearest" });
    }

    function close(): void {
        list.hidden = true;
        input.setAttribute("aria-expanded", "false");
        setActive(-1);
    }

    function pick(value: string): void {
        input.value = value;
        close();
        onPick?.(value);
    }

    toggle.addEventListener("mousedown", (e) => e.preventDefault());
    toggle.addEventListener("click", () => {
        if (list.hidden) {
            input.focus();
            open("");
        } else {
            close();
        }
    });
    input.addEventListener("input", () => open(input.value));
    input.addEventListener("blur", close);
    input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (list.hidden) {
                open("");
                return;
            }
            if (shown.length === 0) return;
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((active + step + shown.length) % shown.length);
        } else if (e.key === "Enter" && !list.hidden && active >= 0) {
            e.preventDefault();
            pick(shown[active]);
        } else if (e.key === "Escape" && !list.hidden) {
            e.preventDefault();
            close();
        }
    });

    return {
        setItems(next: string[]): void {
            items = next;
            if (!list.hidden) render("");
        },
    };
}
