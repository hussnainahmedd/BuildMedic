import { useId, type KeyboardEvent } from "react";

/** Automatic-activation tabs: one tab stop, wrapping arrows, and labeled panels. */
export function useTabKeyboard<T extends string>(options: readonly T[], active: T, onSelect: (option: T) => void) {
  const id = useId();
  const tabId = (option: T) => `${id}-tab-${option}`;
  const panelId = (option: T) => `${id}-panel-${option}`;

  function tabProps(option: T) {
    return {
      id: tabId(option),
      role: "tab" as const,
      "aria-selected": active === option,
      "aria-controls": panelId(option),
      tabIndex: active === option ? 0 : -1,
      onClick: () => onSelect(option),
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.nativeEvent.isComposing) return;
        const index = options.indexOf(option);
        let next: number;
        if (event.key === "ArrowRight") next = (index + 1) % options.length;
        else if (event.key === "ArrowLeft") next = (index - 1 + options.length) % options.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = options.length - 1;
        else return;
        const nextOption = options[next];
        if (nextOption === undefined) return;
        event.preventDefault();
        onSelect(nextOption);
        event.currentTarget.ownerDocument.getElementById(tabId(nextOption))?.focus();
      },
    };
  }

  function panelProps(option: T) {
    return {
      id: panelId(option),
      role: "tabpanel" as const,
      "aria-labelledby": tabId(option),
      tabIndex: 0,
      hidden: active !== option,
      // The existing panel classes set display:grid, which overrides the UA's
      // hidden rule. Keep inactive panels hidden without changing their design.
      style: active !== option ? { display: "none" } : undefined,
    };
  }

  return { tabProps, panelProps };
}
