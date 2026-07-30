/**
 * התוכניות לפי הרשימה שאיתי מסר.
 *
 * הקובץ הזה נפרד מ-program-templates.ts בכוונה. התבניות הישנות נשארות
 * במקומן כי מתאמנים כבר משויכים אליהן ויש להם היסטוריית אימונים, ומחיקה
 * שלהן הייתה מייתמת אותה. אלה תבניות נוספות, לא החלפה.
 *
 * המבנה מ-docs/itay-program-spec.md:
 *   • שלוש רמות. "שלב" אצל איתי הוא רמת קושי.
 *   • בכל רמה שני אימונים, משיכה ודחיפה. אין אימון סיבולת.
 *   • רמה 3 היא תוכנית סקילים אחת, שמבוצעת יום כן יום לא.
 *   • רמה נמשכת 4 עד 6 שבועות, וצריך אישור מאמן כדי לעבור לבאה.
 *
 * המספרים: איתי נתן טווחים ואמר שהמבנה בסיסי וניתן לשינוי. הערכים כאן
 * הם נקודת פתיחה בתוך הטווחים שלו, והוא מכוונן לכל מתאמן.
 *   מורכב: 3-4 סטים, מנוחה 90-120, חזרות בקצה הנמוך של 6-15.
 *   פשוט (יד קדמית ואחורית בלבד): 2-3 סטים, מנוחה 60-90, חזרות בקצה הגבוה.
 *   החזקות: מתחילות ב-15 שניות ועולות בהדרגה עד דקה.
 */

/** [מזהה תרגיל, סטים, חזרות, שניות, מנוחה] — חזרות ושניות סותרים זה את זה. */
type Row = [string, number, number | null, number | null, number];

export type ItayTemplate = {
  id: string;
  title: string;
  description: string;
  level: number;
  weeks: number;
  workouts: { title: string; rows: Row[] }[];
};

/** תרגיל מורכב בחזרות. */
const C = (id: string, reps = 8): Row => [id, 3, reps, null, 90];
/** תרגיל פשוט, יד קדמית או אחורית. */
const S = (id: string, reps = 12): Row => [id, 3, reps, null, 60];
/** החזקה. מתחילים ב-15 שניות. */
const H = (id: string, seconds = 15): Row => [id, 3, null, seconds, 90];

export const ITAY_TEMPLATES: ItayTemplate[] = [
  {
    id: "tpl-itay-1",
    title: "רמה 1 · יסודות",
    description:
      "נקודת הכניסה. שני אימונים בשבוע, משיכה ודחיפה. הקושי נקבע מגובה הטבעות וממנח הגוף, ובתרגילים שמותרת בהם גומייה אפשר להיעזר בה לפי הכוח.",
    level: 1,
    weeks: 6,
    workouts: [
      {
        title: "משיכה",
        rows: [
          H("pullup_hold"),
          C("rotational_pullup"),
          C("hammer_pullup"),
          C("rotational_row"),
          // חתירה פטישים היא amrap בחוברת, מקסימום חזרות בזמן קצוב.
          ["hammer_row", 3, 15, null, 90],
          C("shoulder_rotation"),
          H("shoulder_extension"),
          S("bicep_curl"),
          S("preacher_curl"),
        ],
      },
      {
        title: "דחיפה",
        rows: [
          H("dip_hold"),
          C("narrow_dips"),
          C("wide_dips"),
          C("pushup", 10),
          C("fly"),
          C("fly_single", 6),
          S("jackson_extension"),
          S("jackson"),
        ],
      },
    ],
  },
  {
    id: "tpl-itay-2",
    title: "רמה 2 · התקדמות",
    description:
      "אותו מבנה, תרגילים קשים יותר. נכנסות כאן עבודה על יד אחת ותרגילי חגורת כתפיים. עוברים לכאן רק אחרי שרמה 1 יציבה.",
    level: 2,
    weeks: 6,
    workouts: [
      {
        title: "משיכה",
        rows: [
          C("wide_pullup"),
          C("single_pullup", 6),
          C("wide_row"),
          C("shoulder_abduction_t", 10),
          C("shoulder_abduction_y", 10),
          C("external_rotation", 10),
          S("bicep_curl"),
          S("preacher_curl"),
        ],
      },
      {
        title: "דחיפה",
        rows: [
          C("dips"),
          C("single_dips", 6),
          C("fly"),
          C("fly_single", 6),
          S("jackson_extension"),
          S("jackson"),
        ],
      },
    ],
  },
  {
    id: "tpl-itay-3",
    title: "רמה 3 · סקילים",
    description:
      "תוכנית אחת, יום כן יום לא. כאן נכנסים הסקילים: מסאל אפ, פרונט לבר, בק לבר וישו. בכולם אפשר להיעזר בגומייה.",
    level: 3,
    weeks: 6,
    workouts: [
      {
        title: "סקילים",
        rows: [
          C("single_pullup", 6),
          C("single_dips", 6),
          C("muscle_up", 6),
          H("front_lever"),
          H("back_lever"),
          C("iron_cross", 6),
        ],
      },
    ],
  },
];
