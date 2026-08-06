/**
 * תבניות התוכניות — שלוש רמות, כל אחת 24 אימונים בשני שלבים.
 *
 * מבנה השלבים, מספר האימונים בשבוע וסדר התרגילים (מורכב בהתחלה, מבודד בסוף)
 * לקוחים מהחוברת. המספרים עצמם — סטים, חזרות, שניות, מנוחות, גובה טבעת —
 * הם נקודת פתיחה סבירה שמאמן FITAY אמור לכוונן. החוברת מגדירה שיטת התקדמות,
 * לא טבלת מספרים.
 *
 * כל תבנית נזרעת כ-is_template=1. מאמן FITAY משכפל ממנה תוכנית אישית למתאמן,
 * והמקור נשאר נקי.
 */

/** [מזהה תרגיל, סטים, חזרות, שניות, מנוחה] — חזרות ושניות סותרים זה את זה. */
type Row = [string, number, number | null, number | null, number];

type PhaseSpec = {
  /** גובה הטבעת ומנח הגוף חלים על כל תרגילי השלב. */
  ringHeight: string;
  bodyAngle: string;
  workouts: { title: string; rows: Row[] }[];
};

export type ProgramTemplate = {
  id: string;
  title: string;
  description: string;
  level: number;
  weeks: number;
  phases: [PhaseSpec, PhaseSpec];
};

export const TEMPLATES: ProgramTemplate[] = [
  // ───────────────────────────────────────────────────────────── רמה 1
  {
    id: "tpl-level-1",
    title: "רמה 1 · יסודות הטבעות",
    description:
      "נקודת הכניסה. טבעות גבוהות וגוף זקוף, כך שהקושי מגיע מהטכניקה ולא מהמשקל. המטרה בשלב הזה היא ללמוד את ארבעת החוקים ואת הקצב, לא להתיש.",
    level: 1,
    weeks: 8,
    phases: [
      {
        ringHeight: "גבוה",
        bodyAngle: "גוף זקוף",
        workouts: [
          {
            title: "אימון א׳ · דגש דחיפה",
            rows: [
              ["pushup", 3, 10, null, 90],
              ["rotational_row", 3, 10, null, 90],
              ["dip_hold", 3, null, 20, 90],
              ["shoulder_rotation", 3, 10, null, 60],
              ["bicep_curl", 3, 12, null, 60],
              ["jackson_extension", 3, 12, null, 60],
            ],
          },
          {
            title: "אימון ב׳ · דגש משיכה",
            rows: [
              ["rotational_row", 3, 12, null, 90],
              ["pushup", 3, 10, null, 90],
              ["pullup_hold", 3, null, 20, 90],
              ["shoulder_rotation", 3, 12, null, 60],
              ["jackson_extension", 3, 12, null, 60],
              ["bicep_curl", 3, 12, null, 60],
            ],
          },
          {
            title: "אימון ג׳ · סיבולת",
            rows: [
              ["hammer_row", 3, null, 40, 90],
              ["pushup", 3, 12, null, 90],
              ["dip_hold", 3, null, 25, 90],
              ["pullup_hold", 3, null, 25, 90],
              ["bicep_curl", 3, 15, null, 60],
              ["jackson_extension", 3, 15, null, 60],
            ],
          },
        ],
      },
      {
        ringHeight: "בינוני",
        bodyAngle: "נטייה 45°",
        workouts: [
          {
            title: "אימון א׳ · דגש דחיפה",
            rows: [
              ["pushup", 4, 12, null, 90],
              ["rotational_row", 4, 12, null, 90],
              ["dip_hold", 3, null, 30, 90],
              ["shoulder_rotation", 3, 12, null, 60],
              ["bicep_curl", 3, 15, null, 60],
              ["jackson_extension", 3, 15, null, 60],
            ],
          },
          {
            title: "אימון ב׳ · דגש משיכה",
            rows: [
              ["rotational_row", 4, 15, null, 90],
              ["pushup", 4, 12, null, 90],
              ["pullup_hold", 3, null, 30, 90],
              ["shoulder_extension", 3, null, 15, 90],
              ["jackson_extension", 3, 15, null, 60],
              ["bicep_curl", 3, 15, null, 60],
            ],
          },
          {
            title: "אימון ג׳ · סיבולת",
            rows: [
              ["hammer_row", 4, null, 45, 90],
              ["pushup", 4, 15, null, 90],
              ["dip_hold", 3, null, 35, 90],
              ["pullup_hold", 3, null, 35, 90],
              ["bicep_curl", 4, 15, null, 60],
              ["jackson_extension", 4, 15, null, 60],
            ],
          },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────── רמה 2
  {
    id: "tpl-level-2",
    title: "רמה 2 · בניית בסיס",
    description:
      "הטבעות יורדות והגוף נכנס לשיפוע. נכנסים המקבילים הצרים ופשיטת הכתפיים, שני תרגילים שדורשים שליטה בליבה. מכאן ההתקדמות היא בעיקר דרך נוהל הצבירה.",
    level: 2,
    weeks: 8,
    phases: [
      {
        ringHeight: "בינוני",
        bodyAngle: "נטייה 45°",
        workouts: [
          {
            title: "אימון א׳ · דגש דחיפה",
            rows: [
              ["narrow_dips", 3, 8, null, 120],
              ["rotational_row", 4, 12, null, 90],
              ["pushup", 3, 15, null, 90],
              ["shoulder_extension", 3, null, 15, 90],
              ["jackson_extension", 3, 12, null, 60],
              ["bicep_curl", 3, 12, null, 60],
            ],
          },
          {
            title: "אימון ב׳ · דגש משיכה",
            rows: [
              ["rotational_row", 4, 15, null, 90],
              ["narrow_dips", 3, 8, null, 120],
              ["pullup_hold", 3, null, 30, 90],
              ["shoulder_rotation", 3, 12, null, 60],
              ["bicep_curl", 3, 15, null, 60],
              ["jackson_extension", 3, 12, null, 60],
            ],
          },
          {
            title: "אימון ג׳ · סיבולת",
            rows: [
              ["hammer_row", 4, null, 45, 90],
              ["pushup", 4, 15, null, 90],
              ["dip_hold", 3, null, 40, 90],
              ["pullup_hold", 3, null, 40, 90],
              ["shoulder_extension", 3, null, 20, 90],
              ["bicep_curl", 4, 15, null, 60],
            ],
          },
        ],
      },
      {
        ringHeight: "נמוך",
        bodyAngle: "נטייה תלולה",
        workouts: [
          {
            title: "אימון א׳ · דגש דחיפה",
            rows: [
              ["narrow_dips", 4, 10, null, 120],
              ["rotational_row", 4, 15, null, 90],
              ["pushup", 4, 15, null, 90],
              ["shoulder_extension", 3, null, 20, 90],
              ["jackson_extension", 4, 12, null, 60],
              ["bicep_curl", 4, 12, null, 60],
            ],
          },
          {
            title: "אימון ב׳ · דגש משיכה",
            rows: [
              ["rotational_pullup", 3, 5, null, 120],
              ["rotational_row", 4, 15, null, 90],
              ["narrow_dips", 3, 10, null, 120],
              ["pullup_hold", 3, null, 40, 90],
              ["bicep_curl", 4, 15, null, 60],
              ["jackson_extension", 4, 12, null, 60],
            ],
          },
          {
            title: "אימון ג׳ · סיבולת",
            rows: [
              ["hammer_row", 4, null, 60, 90],
              ["pushup", 4, 20, null, 90],
              ["dip_hold", 4, null, 45, 90],
              ["pullup_hold", 4, null, 45, 90],
              ["shoulder_rotation", 4, 15, null, 60],
              ["jackson_extension", 4, 15, null, 60],
            ],
          },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────── רמה 3
  {
    id: "tpl-level-3",
    title: "רמה 3 · שליטה",
    description:
      "מתח בסיבוב ומקבילים צר הם הליבה. הטבעות נמוכות, הגוף מקביל לרצפה, וכל תרגיל דורש False Grip יציב. ברמה הזו ההתקדמות איטית, וזה תקין.",
    level: 3,
    weeks: 8,
    phases: [
      {
        ringHeight: "נמוך",
        bodyAngle: "גוף מקביל לרצפה",
        workouts: [
          {
            title: "אימון א׳ · דגש דחיפה",
            rows: [
              ["narrow_dips", 4, 10, null, 120],
              ["rotational_pullup", 4, 6, null, 120],
              ["pushup", 4, 20, null, 90],
              ["shoulder_extension", 4, null, 20, 90],
              ["jackson_extension", 4, 15, null, 60],
              ["bicep_curl", 4, 15, null, 60],
            ],
          },
          {
            title: "אימון ב׳ · דגש משיכה",
            rows: [
              ["rotational_pullup", 4, 8, null, 120],
              ["rotational_row", 4, 20, null, 90],
              ["narrow_dips", 4, 10, null, 120],
              ["pullup_hold", 4, null, 45, 90],
              ["bicep_curl", 4, 15, null, 60],
              ["jackson_extension", 4, 15, null, 60],
            ],
          },
          {
            title: "אימון ג׳ · סיבולת",
            rows: [
              ["hammer_row", 4, null, 60, 90],
              ["dip_hold", 4, null, 50, 90],
              ["pullup_hold", 4, null, 50, 90],
              ["shoulder_rotation", 4, 15, null, 60],
              ["shoulder_extension", 4, null, 25, 90],
              ["bicep_curl", 4, 20, null, 60],
            ],
          },
        ],
      },
      {
        ringHeight: "נמוך",
        bodyAngle: "גוף מקביל לרצפה · רגליים מוגבהות",
        workouts: [
          {
            title: "אימון א׳ · דגש דחיפה",
            rows: [
              ["narrow_dips", 4, 12, null, 120],
              ["rotational_pullup", 4, 8, null, 120],
              ["pushup", 4, 25, null, 90],
              ["shoulder_extension", 4, null, 25, 90],
              ["jackson_extension", 4, 15, null, 60],
              ["bicep_curl", 4, 15, null, 60],
            ],
          },
          {
            title: "אימון ב׳ · דגש משיכה",
            rows: [
              ["rotational_pullup", 5, 8, null, 120],
              ["rotational_row", 4, 20, null, 90],
              ["narrow_dips", 4, 12, null, 120],
              ["pullup_hold", 4, null, 60, 90],
              ["bicep_curl", 4, 20, null, 60],
              ["jackson_extension", 4, 20, null, 60],
            ],
          },
          {
            title: "אימון ג׳ · סיבולת",
            rows: [
              ["hammer_row", 5, null, 60, 90],
              ["dip_hold", 4, null, 60, 90],
              ["pullup_hold", 4, null, 60, 90],
              ["shoulder_rotation", 4, 20, null, 60],
              ["shoulder_extension", 4, null, 30, 90],
              ["bicep_curl", 5, 20, null, 60],
            ],
          },
        ],
      },
    ],
  },
];
