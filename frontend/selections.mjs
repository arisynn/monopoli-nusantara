// Native <select> remains a hidden value adapter; only in-game buttons receive input.
let nextId = 0;
export function enhanceSelections(root) {
  for (const select of root.querySelectorAll("select")) {
    if (select.dataset.enhanced) continue;
    select.dataset.enhanced = "true";
    select.hidden = true;
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    const wrapper = document.createElement("div");
    wrapper.className = "game-selection";
    select.after(wrapper);
    wrapper.append(select);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "selection-trigger";
    button.dataset.selectionName = select.name;
    button.disabled = select.disabled;
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-haspopup", "listbox");
    const list = document.createElement("div");
    list.id = `nusa-options-${++nextId}`;
    list.className = "selection-options";
    list.hidden = true;
    list.setAttribute("role", "listbox");
    button.setAttribute("aria-controls", list.id);
    const label =
      select.getAttribute("aria-label") ||
      select.closest("label")?.querySelector("b")?.textContent ||
      select.closest("label")?.childNodes[0]?.textContent?.trim() ||
      select.name;
    button.setAttribute("aria-label", label);
    list.setAttribute("aria-label", label);
    const close = () => {
      list.hidden = true;
      button.setAttribute("aria-expanded", "false");
    };
    const options = [...select.options].map((option) => {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.tabIndex = -1;
      choice.setAttribute("role", "option");
      choice.textContent = option.textContent;
      choice.dataset.value = option.value;
      choice.disabled = option.disabled || option.parentElement?.disabled;
      choice.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        select.value = option.value;
        update();
        close();
        button.focus();
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      list.append(choice);
      return choice;
    });
    function update() {
      button.textContent = select.selectedOptions[0]?.textContent || "Pilih";
      for (const option of options)
        option.setAttribute(
          "aria-selected",
          String(option.dataset.value === select.value),
        );
    }
    const open = () => {
      for (const old of root.querySelectorAll(
        ".selection-options:not([hidden])",
      )) {
        old.hidden = true;
        old.parentElement
          .querySelector(".selection-trigger")
          .setAttribute("aria-expanded", "false");
      }
      list.hidden = false;
      button.setAttribute("aria-expanded", "true");
      (
        options.find((o) => o.dataset.value === select.value && !o.disabled) ||
        options.find((o) => !o.disabled)
      )?.focus();
    };
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      list.hidden ? open() : close();
    });
    wrapper.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !list.hidden) {
        e.preventDefault();
        e.stopPropagation();
        close();
        button.focus();
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        if (list.hidden) {
          open();
          return;
        }
        const enabled = options.filter((o) => !o.disabled),
          i = enabled.indexOf(document.activeElement),
          next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? enabled.length - 1
                : (i + (e.key === "ArrowDown" ? 1 : -1) + enabled.length) %
                  enabled.length;
        enabled[next]?.focus();
      }
    });
    wrapper.addEventListener("focusout", (e) => {
      if (!wrapper.contains(e.relatedTarget)) close();
    });
    select.addEventListener("change", update);
    wrapper.append(button, list);
    update();
  }
}
