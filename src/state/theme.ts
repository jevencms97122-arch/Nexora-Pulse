import { useCallback, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "pulse.theme";

function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && media().matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

/** Called once before the first render: avoids a flash and follows the Windows theme. */
export function applyStoredTheme() {
  apply(readChoice());
  media().addEventListener("change", () => apply(readChoice()));
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice);

  const update = useCallback((next: ThemeChoice) => {
    setChoice(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* the theme simply won't persist */
    }
    apply(next);
  }, []);

  return [choice, update] as const;
}
