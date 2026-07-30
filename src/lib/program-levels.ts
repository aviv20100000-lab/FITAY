const LEVEL_NAMES: Record<number, string> = {
  1: "מתחילים",
  2: "מתקדמים",
  3: "מקצוענים",
};

export function programLevelName(level: number) {
  return LEVEL_NAMES[level] ?? `רמה ${level}`;
}
