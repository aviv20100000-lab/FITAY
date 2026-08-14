import type { Advice, ProgressionMode } from "@/lib/types";

/*
 * ליבת המרשם: התשובה לשאלה "מה מבקשים מהמתאמן היום".
 *
 * קובץ טהור בכוונה, בלי ייבוא של מסד ובלי crypto, כדי ששני הצדדים יוכלו
 * לקרוא אותו: השרת מחשב כאן את המילוי בטעינת העמוד ושולח מספרים מוכנים,
 * והמנוע גוזר מכאן את התקרה והתחתית לצד התגמול. עד האיחוד הזה השאלה
 * נענתה פעמיים, פעם במסך ופעם בשרת, ושלוש סטיות שקטות כבר נולדו מזה.
 * מרגע שהכל כאן, אי אפשר לשנות צד אחד בלי לגעת בשני.
 */

/**
 * כמה מוסיפים היום מעל מה שהושג בפעם הקודמת.
 *
 * בחזרות תוספת של אחת היא דרישה שמרגישים. בהחזקות שנייה אחת נבלעת: 46
 * שניות במקום 45 אינן דרישה, והן גם מספר שקשה לקרוא על טיימר תוך כדי
 * מאמץ. חמש שניות נשארות בקנה המידה שבו מודדים החזקות.
 */
export const REPS_STEP = 1;
export const HOLD_STEP = 5;

/** מה נרשם בתרגיל הזה — חזרות או שניות. amrap נמדד בחזרות בתוך זמן קצוב. */
export function logsReps(type: "reps" | "hold" | "amrap") {
  return type !== "hold";
}

/**
 * תקרת הטווח של התרגיל. תשובה אחת לכל המסך ולמנוע.
 *
 * קודם כל צד חישב אותה בנפרד: התצוגה נפלה מ-seconds ל-reps כשהשדה
 * המתאים לסוג ריק, המילוי קרא רק את השדה המתאים, והמנוע דילג על השורה
 * לגמרי. בשורה שבה הערך יושב בשדה הלא נכון — תרגיל החזקה עם 8 בשדה
 * החזרות — התצוגה הראתה טווח 5 עד 8 והקלט הציע 30, על אותו כרטיס.
 *
 * amrap מקבל את השניות כמשך הסט, וזה לא יעד לטפס אליו.
 */
export function ceilingOf(item: {
  type: "reps" | "hold" | "amrap";
  reps: number | null;
  seconds: number | null;
}): number | null {
  if (item.type === "amrap") return item.seconds;
  return (item.type === "reps" ? item.reps : item.seconds) ?? item.reps ?? item.seconds;
}

/**
 * תחתית טווח העבודה. כשהמאמן לא קבע תחתית, ברירת המחדל היא 60 אחוז
 * מהתקרה — היעד שהיה בתוכנית נשאר התקרה, והתחתית נגזרת ממנו. מחושב
 * בזמן קריאה בכוונה: ערך שממולא במיגרציה היה הופך לשני מקורות אמת.
 */
export function rangeFloor(item: {
  targetMin: number | null;
  reps: number | null;
  seconds: number | null;
}): number | null {
  if (item.targetMin != null) return item.targetMin;
  const ceiling = item.reps ?? item.seconds;
  if (ceiling == null) return null;
  return Math.max(1, Math.round(ceiling * 0.6));
}

/** כל מה שחישוב המרשם צריך לדעת על תרגיל. מגיע כולו מהשרת בטעינה. */
export type PrescriptionInput = {
  type: "reps" | "hold" | "amrap";
  progression: ProgressionMode;
  reps: number | null;
  seconds: number | null;
  /** תחתית טווח העבודה, כפי ש-rangeFloor חישב. null בתרגילי amrap. */
  floor: number | null;
  /** התרגיל כבר בוצע בתוכנית קודמת של אותו מתאמן. */
  seenBefore: boolean;
  /** ההנחיה מהמנגנון לאימון הזה. */
  advice: Advice;
  /** הסטים מהפעם הקודמת בדרגה הנוכחית, לפי הסדר. null בלי היסטוריה. */
  lastSets: { reps: number | null; seconds: number | null }[] | null;
};

/**
 * מה נרשם בסט הזה בפעם הקודמת.
 *
 * לפי מספר הסט ולא לפי הסט הראשון. קודם הערך של הסט הראשון היה ממולא
 * בכל הסטים, ולכן מי שעשה 12 ואז 10 ואז 8 קיבל 12 בשלושתם, ומי שאישר
 * בלי לגעת רשם במסד עלייה שלא קרתה בשני הסטים האחרונים.
 *
 * סט שלא היה בפעם הקודמת, למשל אחרי אימון התאוששות עם חצי מהסטים,
 * נשען על הסט האחרון שכן נרשם.
 */
export function previousSetValue(
  input: PrescriptionInput,
  setNumber: number
): number | null {
  const sets = input.lastSets;
  if (!sets || sets.length === 0) return null;
  const row = sets[setNumber - 1] ?? sets[sets.length - 1];
  if (!row) return null;
  return logsReps(input.type) ? row.reps : row.seconds;
}

/**
 * המספר שממולא מראש בסט הזה: היעד להיום.
 *
 * כאן ישבה הבעיה שהשביתה את כל המנגנון. קודם מולאה ההיסטוריה, כלומר מה
 * שנעשה בפעם הקודמת, והמתאמנים אישרו אותה בלי לגעת. אחרי הקשיה ברירת
 * המחדל הייתה תחתית הטווח, המתאמן אישר אותה שוב ושוב, ולכן לעולם לא חזר
 * לתקרה ולעולם לא עלה דרגה בשנית. כל תרגיל קיבל בדיוק הקשיה אחת ואז קפא.
 *
 * עכשיו ממולא היעד, ולכן אישור בלי נגיעה פירושו התקדמות. העריכה נדרשת
 * דווקא בכישלון, שהוא אירוע נדיר ושווה נגיעה.
 */
export function targetValue(input: PrescriptionInput, setNumber: number): number {
  const reps = logsReps(input.type);
  const previous = previousSetValue(input, setNumber);
  const program = reps ? input.reps ?? 10 : input.seconds ?? 20;

  /*
   * הנחיה שמשאירה את התרגיל בדרגתו מתחילה מחדש מתחתית הטווח.
   *
   * הכרטיס שמעל הקלט מבטיח "מתחילים היום מ-6", והקלט היה ממולא מהביצוע
   * הקודם ועוד תוספת, כלומר בדרך כלל מהתקרה. שני חלקי אותו מסך אמרו
   * דברים סותרים, והמתאמן שציית לכרטיס גם נספר כתקוע. הנחיות שמעלות
   * דרגה לא צריכות את זה: שם ההיסטוריה ריקה ממילא.
   */
  if (input.advice === "easier" || input.advice === "drop-band") {
    return input.floor ?? program;
  }
  if (previous == null) {
    /*
     * בלי היסטוריה בדרגה הזאת מתחילים מתחתית הטווח. זה גם המצב מיד אחרי
     * הקשיה, כי ההשוואה נעשית רק בתוך אותה דרגת קושי.
     *
     * חוץ ממעבר שלב: תרגיל שנמצא גם בתוכנית הקודמת וגם בחדשה ממשיך
     * ממקסימום הטווח, כי המתאמן כבר עשה אותו לאורך שלב שלם והחזרה למטה
     * הייתה מבטלת את מה שצבר. החלטה של איתי מ-13 באוגוסט 2026.
     *
     * רק בציר חזרות וזמן. בתרגיל מנח יש סולם מנחים שמתאפס עם הריצה,
     * ופתיחה בתקרה שם הייתה מזניקה הקשיה בתוך שני אימונים. ו-amrap
     * נשאר בחוץ: שם שדה השניות הוא משך הסט ולא יעד, ותרגיל כזה היה
     * נפתח עם 60 חזרות על סט של 60 שניות.
     */
    if (input.seenBefore && input.progression !== "stance" && input.type !== "amrap") {
      return (reps ? input.reps : input.seconds) ?? input.floor ?? program;
    }

    return input.floor ?? program;
  }
  const next = previous + (reps ? REPS_STEP : HOLD_STEP);
  const ceiling = ceilingOf(input);
  if (ceiling == null) return next;
  /*
   * התקרה עוצרת את הטיפוס בכל הצירים. איתי הכריע (13 באוגוסט 2026)
   * שהטווח הוא תקרה בכל התרגילים, ומאז המסך והתוכנית אומרים אותו דבר.
   */
  return Math.min(next, ceiling);
}

/**
 * המרשם המלא לתרגיל: מספר אחד לכל סט, מוכן למסך.
 *
 * זה מה שהשרת שולח ללקוח בטעינה. ללקוח לא נשאר שום חישוב מרשם, רק
 * הכפתורים, הצד החזק שעוקב אחרי החלש ודגל הנגיעה.
 */
export function prescriptions(input: PrescriptionInput, sets: number): number[] {
  return Array.from({ length: sets }, (_, i) => targetValue(input, i + 1));
}
