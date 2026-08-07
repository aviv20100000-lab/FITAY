import type { Exercise } from "./types";

// המקור עבר ל-categories.ts כדי שמסכים בצד הלקוח יוכלו לייבא את השמות
// בלי לגרור איתם את כל תוכן התרגילים. הייצוא נשאר כאן למי שכבר משתמש בו.
export { CATEGORIES } from "./categories";

/**
 * ספריית התרגילים — מתוך חוברת ההדרכה של FITAY.
 * המשמעות המקצועית נשמרת, והניסוח מותאם לעברית פשוטה בגוף שני יחיד.
 * videoFile נשאר null עד שמאמן FITAY ימפה סרטון לכל תרגיל.
 */
export const EXERCISES: Omit<Exercise, "videoFile">[] = [
  {
    id: "pushup",
    name: "שכיבות שמיכה",
    category: "push",
    kind: "strength",
    type: "reps",
    tempo: "30X1",
    muscles: "חזה, יד אחורית",
    description:
      "מחזק את החזה ואת היד האחורית ומכין אותך לתרגיל המקבילים. זה תרגיל בסיסי שאפשר להתקדם בו דרך טכניקה טובה יותר, שליטה בקצב והוספת חזרות.",
    technique: [
      "מנח אגן לפנים, בטן מכווצת וחזה בחוץ",
      "לקרב שכמות בירידה",
      "סיבוב של היד בעלייה",
    ],
    tips: ["שמור על גוף ישר", "משוך עם המרפקים לכיוון הצלעות", "שליטה מלאה בתנועה"],
    unilateral: false,
  },
  {
    id: "rotational_pullup",
    name: "מתח בסיבוב",
    category: "pull",
    kind: "strength",
    type: "reps",
    tempo: "30X1",
    muscles: "רחב גבי, יד קדמית",
    description:
      "מחזק בעיקר את שריר הרחב גבי ואת שרירי היד הקדמית. במהלך העלייה האחיזה מסתובבת, ולכן הדגש בין השרירים משתנה. חשוב לבצע את הסיבוב בשליטה.",
    technique: [
      "אחיזה חזקה - False Grip",
      "מנח אגן לפנים ובטן מכווצת",
      "סיבוב של היד תוך כדי העלייה",
      "לקרב שכמות בסוף העלייה",
      "לשחרר שכמות בסוף הירידה",
    ],
    tips: ["אחיזה חזקה לאורך כל התרגיל", "טווח תנועה מלא", "מנח צוואר בקו עמוד השדרה"],
    unilateral: false,
  },
  {
    id: "narrow_dips",
    name: "מקבילים צר",
    category: "push",
    kind: "strength",
    type: "reps",
    tempo: "30X1",
    muscles: "חזה, כתף, שכמה, יד אחורית",
    description:
      "מחזק בעיקר את החזה, הכתפיים, השכמות והיד האחורית. המטרה היא לשמור על הטבעות יציבות. מנח צר מדגיש יותר את היד האחורית, ומנח רחב מדגיש יותר את החזה.",
    technique: [
      "אחיזה חזקה - False Grip",
      "מנח אגן לפנים ובטן מכווצת",
      "סיבוב של היד תוך כדי העלייה",
      "לקרב שכמות בסוף העלייה",
      "לשחרר שכמות למעלה בסוף הירידה",
    ],
    tips: ["מזער רעידות של הטבעות", "אחיזה חזקה", "טווח תנועה מלא"],
    unilateral: false,
  },
  {
    id: "dip_hold",
    name: "החזקת מקבילים",
    category: "push",
    kind: "strength",
    type: "hold",
    tempo: "החזקה סטטית",
    muscles: "כתפיים, אחיזה",
    description:
      "החזקה סטטית שמחזקת את האחיזה ואת אזור הכתפיים ומכינה לתרגילי דחיפה ומקבילים. החזק למשך הזמן שרשום בתוכנית.",
    technique: [
      "אחיזה חזקה וידיים ישרות - False Grip",
      "מנח אגן לפנים ובטן מכווצת",
      "רגליים מלפני הגוף",
      "חזה בחוץ, שכמות בקירוב ולמטה",
      "כתפיים ישרות ומקבילות",
    ],
    tips: ["הימנע מרעידות הטבעות", "אחיזה חזקה לאורך כל ההחזקה"],
    unilateral: false,
  },
  {
    id: "rotational_row",
    name: "חתירה בסיבוב",
    category: "pull",
    kind: "strength",
    type: "reps",
    tempo: "30X1",
    muscles: "גב, שכמות, יד קדמית",
    description:
      "מחזק בעיקר את הגב, השכמות והיד הקדמית ומכין אותך לתרגילי מתח. במהלך העלייה האחיזה מסתובבת, ולכן הדגש בין השרירים משתנה.",
    technique: [
      "מנח אגן לפנים, בטן מכווצת וחזה בחוץ",
      "לקרב שכמות בעלייה",
      "סיבוב של היד בעלייה",
      "הרחקה של השכמות בסוף הירידה",
    ],
    tips: ["שליטה מלאה בירידה", "לקרב שכמות בשיא התנועה"],
    unilateral: false,
  },
  {
    id: "shoulder_rotation",
    name: "סיבוב כתפיים",
    category: "pull",
    kind: "strength",
    type: "reps",
    tempo: "30X1",
    muscles: "שכמות, כתף אחורית, יד קדמית",
    description:
      "מחזק בעיקר את השכמות, הכתף האחורית והיד הקדמית ועוזר לשפר את היציבה. זה תרגיל פחות מוכר, לכן חשוב לקרוא את הדגשים ולבצע אותו בשליטה.",
    technique: [
      "מנח אגן לפנים, בטן מכווצת וחזה בחוץ",
      "לקרב שכמות בעלייה",
      "כיפוף במרפק 90 מעלות בגובה כתף בעלייה",
      "הרחקה של השכמות בסוף הירידה",
    ],
    tips: ["טכניקה לפני הכל", "תנועה מבוקרת ואיטית"],
    unilateral: false,
  },
  {
    id: "hammer_row",
    name: "חתירה פטישים",
    category: "pull",
    kind: "strength",
    type: "amrap",
    tempo: "מקסימום חזרות",
    muscles: "גב, יד קדמית",
    description:
      "מחזק בעיקר את הגב ואת היד הקדמית ומשפר את סיבולת השריר. בצע כמה שיותר חזרות טובות בזמן שרשום, בלי לקצר את התנועה ובלי לאבד שליטה.",
    technique: [
      "מנח אגן לפנים, בטן מכווצת וחזה בחוץ",
      "לקרב שכמות בעלייה",
      "מרפק קרוב לגוף בעלייה",
      "הרחקה של השכמות בסוף הירידה",
    ],
    tips: ["כמה שיותר חזרות באיכות גבוהה", "טווח תנועה מלא"],
    unilateral: false,
  },
  {
    id: "pullup_hold",
    name: "החזקת מתח",
    category: "pull",
    kind: "strength",
    type: "hold",
    tempo: "החזקה סטטית",
    muscles: "אמות, גב",
    description:
      "החזקה סטטית שמחזקת בעיקר את האמות ואת האחיזה ומכינה לתרגילי מתח ומשיכה. החזק למשך הזמן שרשום בתוכנית.",
    technique: [
      "אחיזה חזקה וידיים ישרות - False Grip",
      "מנח אגן לפנים ובטן מכווצת",
      "רגליים מלפני הגוף",
      "חזה בחוץ, שכמות בקירוב ולמטה",
      "ידיים בקו האוזניים",
    ],
    tips: ["אחיזה חזקה עד הסוף", "נשימה קבועה"],
    unilateral: false,
  },
  {
    id: "shoulder_extension",
    name: "פשיטת כתפיים",
    category: "core",
    kind: "strength",
    type: "hold",
    tempo: "35X0",
    muscles: "ליבה, בטן, זוקפי גו, כתפיים",
    description:
      "מחזק בעיקר את שרירי הליבה, הבטן, זוקפי הגו והכתפיים. זה תרגיל סטטי: שמור על המנח למשך מספר השניות שרשום בתוכנית.",
    technique: [
      "אחיזה חזקה - False Grip",
      "מנח אגן לפנים, בטן מכווצת וחזה בחוץ",
      "ידיים ישרות וזרועות בקו אוזניים בירידה",
    ],
    tips: ["שמור על בטן מכווצת לאורך כל ההחזקה"],
    unilateral: false,
  },
  {
    id: "bicep_curl",
    name: "כפיפות מרפקים",
    category: "isolation",
    kind: "strength",
    type: "reps",
    tempo: "30X0",
    muscles: "יד קדמית, כתפיים",
    description:
      "תרגיל מבודד שמחזק בעיקר את היד הקדמית ואת הכתפיים. עובדים בו קרוב לכישלון, לפי היעד שרשום בתוכנית.",
    technique: [
      "אחיזה חזקה - False Grip",
      "מנח אגן לפנים, בטן מכווצת וחזה בחוץ",
      "ידיים בגובה כתפיים לכיוון המצח",
    ],
    tips: ["תרגיל מבודד, מותר וכדאי להגיע לכישלון"],
    unilateral: false,
  },
  {
    // ב-FITAY הבהירו שפשיטת מרפקים וג'קסון הם שני תרגילים נפרדים.
    // כאן נשאר פשיטת מרפקים, וג'קסון נוסף כתרגיל בפני עצמו למטה.
    // המזהה לא שונה בכוונה: יש עליו כבר היסטוריית אימונים במסד.
    id: "jackson_extension",
    name: "פשיטת מרפקים",
    category: "isolation",
    kind: "strength",
    type: "reps",
    tempo: "30X0",
    muscles: "יד אחורית, כתפיים, חזה",
    description:
      "תרגיל מבודד שמחזק בעיקר את היד האחורית, הכתפיים והחזה. עובדים בו קרוב לכישלון, לפי היעד שרשום בתוכנית.",
    technique: [
      "אחיזה חזקה - False Grip",
      "מנח אגן לפנים, בטן מכווצת וחזה בחוץ",
      "כתפיים ישרות ומקבילות",
    ],
    tips: ["תרגיל מבודד, מותר וכדאי להגיע לכישלון"],
    unilateral: false,
  },

  /* ── התוכנית המורחבת של FITAY ────────────────────────────────────────
   *
   * התרגילים מכאן ומטה הגיעו מרשימת התוכנית של FITAY, ולא מהחוברת.
   * ראה docs/itay-program-spec.md.
   *
   * תיאור וטכניקה נכתבים כאן רק כשהם הגיעו ממנו. תרגיל שטרם קיבלנו
   * עבורו טקסט נשאר עם שדות ריקים, והמסך פשוט לא מציג את הכרטיס.
   * עדיף תרגיל בלי הסבר על הסבר שהומצא.
   */

  {
    id: "jackson",
    name: "ג'קסון",
    category: "isolation",
    kind: "strength",
    type: "reps",
    tempo: "",
    muscles: "",
    description: "",
    technique: [],
    tips: [],
    unilateral: false,
  },
  {
    id: "preacher_curl",
    name: "כפיפת שקנאי",
    category: "isolation",
    kind: "strength",
    type: "reps",
    tempo: "",
    muscles: "יד קדמית",
    description:
      "תרגיל לחיזוק שריר הזרוע הקדמית תוך עבודה בטווח תנועה מלא של המרפק והכתף.",
    technique: [
      "אחיזת פולס גריפ",
      "מרפקים צמודים לגוף",
      "כתפיים בסיבוב חיצוני",
      "רד עד כמעט ליישור מלא של המרפקים",
      "חזור לעמדת המוצא בשליטה",
    ],
    tips: [],
    unilateral: false,
  },
  {
    id: "external_rotation",
    name: "סיבוב חיצוני",
    category: "pull",
    kind: "strength",
    type: "reps",
    tempo: "",
    muscles: "חגורת כתפיים אחורית",
    description:
      "תרגיל לחיזוק חלקה האחורי של חגורת הכתפיים, לשיפור היציבה, היציבות ואיזון השרירים.",
    technique: [
      "מרכז גוף יציב ובית חזה פתוח",
      "משוך את הטבעות לכיוון הפנים",
      "קרב את השכמות",
      "סובב את הכתפיים כלפי חוץ",
      "חזור באיטיות ובשליטה",
    ],
    tips: [],
    unilateral: false,
  },
  {
    id: "fly",
    name: "פרפר",
    category: "push",
    kind: "strength",
    type: "reps",
    tempo: "",
    muscles: "חזה, חגורת כתפיים",
    description:
      "תרגיל לחיזוק שרירי החזה בטווח תנועה מלא, תוך שיפור השליטה והיציבות בחגורת הכתפיים.",
    technique: [
      "מרפקים בקו השכמות",
      "שכמות אסופות",
      "רד עד כ-90 מעלות במרפקים",
      "קרב את המרפקים בעלייה",
      "סובב את הטבעות החוצה בסיום התנועה",
    ],
    tips: [],
    unilateral: false,
  },
  {
    id: "fly_single",
    name: "פרפר יד־יד",
    category: "push",
    kind: "strength",
    type: "reps",
    tempo: "",
    muscles: "חזה, חגורת כתפיים",
    description:
      "אותו תרגיל כמו פרפר, על יד אחת. היד השנייה תומכת ועובדת בטכניקה של שכיבת שמיכה.",
    technique: [
      "מרפקים בקו השכמות",
      "שכמות אסופות",
      "רד עד כ-90 מעלות במרפקים",
      "קרב את המרפקים בעלייה",
      "היד התומכת בטכניקה של שכיבת שמיכה, המרפק צמוד לגוף",
    ],
    tips: [],
    unilateral: true,
  },

  /* וריאציות של תרגילים שכבר מתוארים בחוברת. FITAY אישרו להעתיק להן את
   * הטכניקה מתרגיל האם, כי היא בערך זהה. */
  {
    id: "hammer_pullup",
    name: "מתח פטיש",
    category: "pull",
    kind: "strength",
    type: "reps",
    tempo: "30X1",
    muscles: "רחב גבי, יד קדמית",
    description: "",
    technique: [
      "אחיזה חזקה - False Grip",
      "מנח אגן לפנים ובטן מכווצת",
      "לקרב שכמות בסוף העלייה",
      "לשחרר שכמות בסוף הירידה",
    ],
    tips: [],
    unilateral: false,
  },
  {
    id: "wide_pullup",
    name: "מתח רחב",
    category: "pull",
    kind: "strength",
    type: "reps",
    tempo: "30X1",
    muscles: "רחב גבי, יד קדמית",
    description: "",
    technique: [
      "אחיזה חזקה - False Grip",
      "מנח אגן לפנים ובטן מכווצת",
      "לקרב שכמות בסוף העלייה",
      "לשחרר שכמות בסוף הירידה",
    ],
    tips: [],
    unilateral: false,
  },
  {
    id: "single_pullup",
    name: "מתח יד־יד",
    category: "pull",
    kind: "strength",
    type: "reps",
    tempo: "30X1",
    muscles: "רחב גבי, יד קדמית",
    description:
      "תרגיל על יד אחת. במתחילים מבצעים סט שלם לכל יד ונעזרים בגומייה וביד השנייה. במתקדמים מבצעים לסירוגין, חזרה בכל יד.",
    technique: [
      "אחיזה חזקה - False Grip",
      "מנח אגן לפנים ובטן מכווצת",
      "לקרב שכמות בסוף העלייה",
      "מתחילים תמיד מהיד החלשה",
    ],
    tips: [],
    unilateral: true,
  },
  {
    id: "wide_row",
    name: "חתירה רחבה",
    category: "pull",
    kind: "strength",
    type: "reps",
    tempo: "30X1",
    muscles: "גב, שכמות, יד קדמית",
    description: "",
    technique: [
      "מנח אגן לפנים, בטן מכווצת וחזה בחוץ",
      "לקרב שכמות בעלייה",
      "הרחקה של השכמות בסוף הירידה",
    ],
    tips: [],
    unilateral: false,
  },
  {
    id: "wide_dips",
    name: "מקבילים רחב",
    category: "push",
    kind: "strength",
    type: "reps",
    tempo: "30X1",
    muscles: "חזה, כתף, שכמה, יד אחורית",
    description: "",
    technique: [
      "אחיזה חזקה - False Grip",
      "מנח אגן לפנים ובטן מכווצת",
      "לקרב שכמות בסוף העלייה",
      "לשחרר שכמות למעלה בסוף הירידה",
    ],
    tips: ["מזערו רעידות של הטבעות"],
    unilateral: false,
  },
  {
    id: "dips",
    name: "מקבילים",
    category: "push",
    kind: "strength",
    type: "reps",
    tempo: "30X1",
    muscles: "חזה, כתף, שכמה, יד אחורית",
    description: "",
    technique: [
      "אחיזה חזקה - False Grip",
      "מנח אגן לפנים ובטן מכווצת",
      "לקרב שכמות בסוף העלייה",
      "לשחרר שכמות למעלה בסוף הירידה",
    ],
    tips: ["מזערו רעידות של הטבעות"],
    unilateral: false,
  },
  {
    id: "single_dips",
    name: "מקבילים יד־יד",
    category: "push",
    kind: "strength",
    type: "reps",
    tempo: "30X1",
    muscles: "חזה, כתף, שכמה, יד אחורית",
    description:
      "תרגיל על יד אחת. במתחילים מבצעים סט שלם לכל יד ונעזרים בגומייה וביד השנייה. במתקדמים מבצעים לסירוגין, חזרה בכל יד.",
    technique: [
      "אחיזה חזקה - False Grip",
      "מנח אגן לפנים ובטן מכווצת",
      "מתחילים תמיד מהיד החלשה",
    ],
    tips: [],
    unilateral: true,
  },

  /* ── תרגילים שממתינים לטקסט מ-FITAY ──────────────────────────────────
   * שם ומספרים בלבד. אין תיאור ואין טכניקה, ובכוונה: הטקסט לא הגיע
   * ממנו עדיין, ולא ממציאים תוכן מקצועי. המסך מציג אותם נקי בלי כרטיס
   * הטכניקה, וברגע שהטקסט יגיע הוא נכנס לכאן.
   *
   * הרחקת כתף T ו-Y: הטקסט שהגיע היה זהה מילה במילה לזה של סיבוב
   * חיצוני, כנראה בטעות, ולכן לא הוכנס. ממתין להבהרה.
   */
  {
    id: "shoulder_abduction_t",
    name: "הרחקת כתף T",
    category: "pull",
    kind: "strength",
    type: "reps",
    tempo: "",
    muscles: "חגורת כתפיים אחורית",
    description: "",
    technique: [],
    tips: [],
    unilateral: false,
  },
  {
    id: "shoulder_abduction_y",
    name: "הרחקת כתף Y",
    category: "pull",
    kind: "strength",
    type: "reps",
    tempo: "",
    muscles: "חגורת כתפיים אחורית",
    description: "",
    technique: [],
    tips: [],
    unilateral: false,
  },
  {
    id: "muscle_up",
    name: "מסאל אפ",
    category: "skill",
    kind: "strength",
    type: "reps",
    tempo: "",
    muscles: "",
    description: "",
    technique: [],
    tips: [],
    unilateral: false,
  },
  {
    id: "front_lever",
    name: "פרונט לבר",
    category: "skill",
    kind: "strength",
    type: "hold",
    tempo: "החזקה סטטית",
    muscles: "",
    description: "",
    technique: [],
    tips: [],
    unilateral: false,
  },
  {
    id: "back_lever",
    name: "בק לבר",
    category: "skill",
    kind: "strength",
    type: "hold",
    tempo: "החזקה סטטית",
    muscles: "",
    description: "",
    technique: [],
    tips: [],
    unilateral: false,
  },
  {
    id: "iron_cross",
    name: "ישו",
    category: "skill",
    kind: "strength",
    type: "reps",
    tempo: "",
    muscles: "",
    description: "",
    technique: [],
    tips: [],
    unilateral: false,
  },
];

/**
 * תרגילי חימום.
 *
 * החוברת מחייבת חימום יסודי לפני כל אימון ומפנה לסרטוני הדרכה — אבל לא
 * מפרטת אילו תרגילים. שישה התרגילים כאן הם הצעה: כולם מפרקים שהתוכנית
 * עצמה מעמיסה (כתף, שכמה, מרפק, פרק כף יד), ורובם מבוצעים על הטבעות.
 * מאמן FITAY צריך לאשר, להחליף או להוסיף — הרשימה כתובה כדי שיהיה מה לתקן.
 */
export const WARMUPS: Omit<Exercise, "videoFile">[] = [
  {
    id: "warm_shoulder_circles",
    name: "מעגלי כתפיים",
    category: "warmup",
    kind: "strength",
    type: "reps",
    tempo: "איטי ומבוקר",
    muscles: "כתף, שכמה",
    description:
      "פתיחת מפרק הכתף לפני האימון. זרועות ישרות, מעגלים גדולים ואיטיים קדימה ואחורה, בלי לזרוק את התנועה במומנטום.",
    technique: [
      "עמידה זקופה, בטן מכווצת",
      "מעגלים גדולים ככל שהכתף מאפשרת בנוחות",
      "חצי מהחזרות קדימה וחצי אחורה",
    ],
    tips: ["הכתף מובילה את התנועה, לא הגב"],
    unilateral: false,
  },
  {
    id: "warm_wrist",
    name: "הכנת פרקי ידיים",
    category: "warmup",
    kind: "strength",
    type: "reps",
    tempo: "איטי ומבוקר",
    muscles: "פרק כף יד, אמות",
    description:
      "האחיזה בטבעות מעמיסה על פרק כף היד, במיוחד ב-False Grip. סיבובים ומתיחות קלות לפני האימון מונעים כאב באמצע סט.",
    technique: [
      "סיבובי פרק כף יד לשני הכיוונים",
      "מתיחה קלה של כף היד קדימה ואחורה",
      "פתיחה וסגירה של האגרוף",
    ],
    tips: ["אם יש רגישות ב-False Grip, כאן המקום לטפל בזה"],
    unilateral: false,
  },
  {
    id: "warm_passive_hang",
    name: "תלייה פסיבית",
    category: "warmup",
    kind: "strength",
    type: "hold",
    tempo: "החזקה סטטית",
    muscles: "כתף, שכמה, אחיזה",
    description:
      "תלייה רפויה על הטבעות. פותחת את מפרק הכתף ומכינה את האחיזה. זו לא עבודה, זו שחרור.",
    technique: [
      "אחיזה מלאה, זרועות ישרות",
      "שכמות משוחררות והכתפיים ליד האוזניים",
      "נשימה רגועה לאורך כל ההחזקה",
    ],
    tips: ["אם יש כאב בכתף, קצר את הזמן ואל תוותר על התרגיל"],
    unilateral: false,
  },
  {
    id: "warm_scap_pull",
    name: "משיכות שכמה",
    category: "warmup",
    kind: "strength",
    type: "reps",
    tempo: "2010",
    muscles: "שכמות, גב עליון",
    description:
      "מהתלייה הפסיבית מושכים את השכמות למטה ולאחור בלי לכופף את המרפקים. מפעיל את השרירים שמייצבים את כל תרגילי המשיכה בתוכנית.",
    technique: [
      "מרפקים ישרים לחלוטין לאורך כל התנועה",
      "משיכת שכמות למטה ולאחור",
      "עצירה קצרה למעלה ושחרור מבוקר",
    ],
    tips: ["התנועה קטנה. אם המרפק נכפף, זו כבר חתירה"],
    unilateral: false,
  },
  {
    id: "warm_scap_push",
    name: "דחיפות שכמה",
    category: "warmup",
    kind: "strength",
    type: "reps",
    tempo: "2010",
    muscles: "שכמות, חזה קדמי",
    description:
      "אותה תנועה בכיוון ההפוך, במנח תמיכה או שכיבת שמיכה. דוחפים את השכמות זו מזו. הכנה לכל תרגילי הדחיפה והמקבילים.",
    technique: [
      "מרפקים ישרים, גוף בקו אחד",
      "דחיפת השכמות זו מזו בשיא התנועה",
      "שחרור מבוקר עד קירוב השכמות",
    ],
    tips: ["מנח אגן לפנים ובטן מכווצת, בדיוק כמו בתרגיל האמיתי"],
    unilateral: false,
  },
  {
    id: "warm_chest_open",
    name: "פתיחת חזה",
    category: "warmup",
    kind: "strength",
    type: "hold",
    tempo: "החזקה סטטית",
    muscles: "חזה, כתף קדמית",
    description:
      "אחיזה בטבעות מאחורי קו הגוף ונטייה קלה קדימה עד מתיחה נעימה בחזה. פותח את הכתף לפני עבודת דחיפה.",
    technique: [
      "טבעות בגובה החזה, זרועות ישרות",
      "צעד קטן קדימה עד שמרגישים מתיחה",
      "חזה בחוץ, שכמות בקירוב ולמטה",
    ],
    tips: ["מתיחה נעימה ולא כואבת. בלי לקפוץ בתנועה"],
    unilateral: false,
  },
];

/** הכל יחד — לזריעה למסד ולמסכי בחירת תרגיל. */
export const ALL_EXERCISES = [...WARMUPS, ...EXERCISES];

/**
 * מנות החימום. החימום זהה בכל אימון ולכן הוא לא נשמר כפריטים במסד —
 * הוא נבנה מכאן. מתחילים כללי ועוברים לטבעות. סה"כ 4-5 דקות.
 */
export const WARMUP_PLAN: {
  id: string;
  sets: number;
  reps?: number;
  seconds?: number;
}[] = [
  { id: "warm_shoulder_circles", sets: 2, reps: 10 },
  { id: "warm_wrist", sets: 1, reps: 15 },
  { id: "warm_chest_open", sets: 1, seconds: 30 },
  { id: "warm_passive_hang", sets: 2, seconds: 20 },
  { id: "warm_scap_pull", sets: 2, reps: 10 },
  { id: "warm_scap_push", sets: 2, reps: 10 },
];
