/**
 * קטגוריות התרגילים: המפתח, השם שמוצג, והסדר.
 *
 * יושב במודול נפרד ולא בתוך exercises-data.ts, כי מסכים בצד הלקוח צריכים
 * את השמות האלה בשביל סינון, ואילו הקובץ ההוא נושא איתו את כל תוכן
 * התרגילים. שתי רשימות של אותם שמות הן הדרך הבטוחה לכך שמסך אחד יראה
 * "מבודדים" ומסך אחר "בידוד".
 */
export const CATEGORIES: Record<string, string> = {
  warmup: "חימום",
  push: "דחיפות",
  pull: "משיכות",
  core: "ליבה",
  isolation: "מבודדים",
  // תרגילי שלב 3 מהרשימה של FITAY. אין להם קטגוריה בחוברת, והם לא
  // דחיפה או משיכה במובן הרגיל.
  skill: "סקילים",
};

/** הסדר שבו קטגוריות מוצגות ומוינות. */
export const CATEGORY_ORDER = Object.keys(CATEGORIES);

/** מיקום הקטגוריה בסדר, ולא־מוכרת נדחפת לסוף. */
export function categoryRank(category: string) {
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

export function categoryName(category: string) {
  return CATEGORIES[category] ?? category;
}
