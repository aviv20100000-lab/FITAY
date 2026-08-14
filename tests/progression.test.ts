import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * המסד ממוקם בזיכרון: המנוע מקבל את כל הקלט שלו כפרמטרים חוץ משאילתת
 * ההיסטוריה, ולכן מספיק לזייף את execute כדי להריץ אותו על נתונים נקיים.
 */
vi.mock("@/lib/db", () => ({
  default: { execute: vi.fn(async () => ({ rows: [] })), batch: vi.fn() },
  initDb: vi.fn(),
}));

import db from "@/lib/db";
import {
  evaluateProgression,
  isRecoverySession,
  rangeFloor,
  recoverySets,
  type ProgressState,
} from "@/lib/progression";

type ItemMeta = Parameters<typeof evaluateProgression>[0]["items"][number];
type LoggedRow = Parameters<typeof evaluateProgression>[0]["rows"][number];

/** שורת היסטוריה כמו ששאילתת ההיסטוריה מחזירה: סך אימון קודם לפי דרגה. */
type HistoryRow = {
  workout_item_id: string;
  difficulty_step: number;
  logged_at: string;
  total: number;
};

function item(over: Partial<ItemMeta> = {}): ItemMeta {
  return {
    id: "item-1",
    exerciseId: "ex-1",
    type: "reps",
    progression: "reps",
    hasStanceLevels: false,
    unilateral: false,
    sets: 3,
    reps: 10,
    seconds: null,
    ...over,
  };
}

/** סטים לאותו פריט, ערך אחד לכל סט, לפי סוג התרגיל. */
function sets(
  meta: ItemMeta,
  values: number[],
  over: Partial<LoggedRow> = {}
): LoggedRow[] {
  return values.map((value, index) => ({
    workoutItemId: meta.id,
    setNumber: index + 1,
    reps: meta.type === "hold" ? null : value,
    seconds: meta.type === "hold" ? value : null,
    side: meta.unilateral ? "weak" : null,
    banded: false,
    untouched: false,
    ...over,
  }));
}

function state(over: Partial<ProgressState> = {}): ProgressState {
  return { difficultyStep: 0, advice: "", stallCount: 0, ceilingStreak: 0, ...over };
}

async function run(options: {
  items: ItemMeta[];
  rows: LoggedRow[];
  states?: Map<string, ProgressState>;
  history?: HistoryRow[];
}) {
  vi.mocked(db.execute).mockResolvedValueOnce({
    rows: options.history ?? [],
  } as never);
  return evaluateProgression({
    assignmentId: "assign-1",
    assignedAt: "2026-08-01T00:00:00.000Z",
    traineeId: "trainee-1",
    workoutId: "workout-1",
    loggedAt: "2026-08-14T10:00:00.000Z",
    items: options.items,
    rows: options.rows,
    states: options.states ?? new Map(),
  });
}

/** הערכים שנכתבים ל-item_progress עבור תרגיל, מתוך פקודות העדכון. */
function progressOf(
  result: Awaited<ReturnType<typeof evaluateProgression>>,
  exerciseId: string
) {
  const statement = result.statements.find(
    (s) => s.sql.includes("item_progress") && s.args[1] === exerciseId
  );
  if (!statement) return null;
  return {
    difficultyStep: Number(statement.args[2]),
    advice: String(statement.args[3]),
    stallCount: Number(statement.args[4]),
    ceilingStreak: Number(statement.args[5]),
  };
}

function eventsOf(
  result: Awaited<ReturnType<typeof evaluateProgression>>,
  exerciseId: string
) {
  return result.statements.filter(
    (s) => s.sql.includes("progression_events") && s.args[4] === exerciseId
  );
}

beforeEach(() => {
  vi.mocked(db.execute).mockClear();
});

describe("ציר חזרות וזמן בתקרת הטווח (הכרעת 13 באוגוסט: נשארים בתקרה)", () => {
  it("תקרה מלאה עם עריכה: אין תקיעות, אין הנחיה, הרצף מסמן שהתקרה הושגה", async () => {
    const meta = item();
    const result = await run({
      items: [meta],
      rows: sets(meta, [10, 10, 10]),
      history: [
        { workout_item_id: meta.id, difficulty_step: 0, logged_at: "x", total: 30 },
      ],
    });
    expect(progressOf(result, "ex-1")).toEqual({
      difficultyStep: 0,
      advice: "",
      stallCount: 0,
      ceilingStreak: 1,
    });
    expect(eventsOf(result, "ex-1")).toHaveLength(0);
  });

  it("אחרי שהתקרה הושגה, אימון שעדיין נוגע בה באחד הסטים נשאר שקט גם בלי שיפור בסך", async () => {
    const meta = item();
    const result = await run({
      items: [meta],
      rows: sets(meta, [10, 9, 9]),
      states: new Map([["ex-1", state({ ceilingStreak: 1 })]]),
      history: [
        { workout_item_id: meta.id, difficulty_step: 0, logged_at: "x", total: 30 },
      ],
    });
    expect(progressOf(result, "ex-1")).toEqual({
      difficultyStep: 0,
      advice: "",
      stallCount: 0,
      ceilingStreak: 1,
    });
  });

  it("מי שירד מהתקרה לגמרי חוזר לבדיקת התקיעות הרגילה", async () => {
    const meta = item();
    // המצב שהמנוע עצמו מייצר אחרי תקרה: הרצף דולק והמונה אפס. הירידה
    // המלאה מהתקרה נספרת כאימון ראשון בלי שיפור.
    const result = await run({
      items: [meta],
      rows: sets(meta, [8, 8, 8]),
      states: new Map([["ex-1", state({ ceilingStreak: 1 })]]),
      history: [
        { workout_item_id: meta.id, difficulty_step: 0, logged_at: "x", total: 30 },
      ],
    });
    expect(progressOf(result, "ex-1")?.advice).toBe("");
    expect(progressOf(result, "ex-1")?.stallCount).toBe(1);
  });

  it("תקרה שהושגה עם גומייה אינה תקרה: המתאמן נשאר בבדיקת התקיעות הרגילה (הכרעת איתי, 14 באוגוסט)", async () => {
    const meta = item();
    const rows = sets(meta, [10, 10, 10]);
    rows[2] = { ...rows[2], banded: true };
    const result = await run({
      items: [meta],
      rows,
      history: [
        { workout_item_id: meta.id, difficulty_step: 0, logged_at: "x", total: 30 },
      ],
    });
    // בלי כניסה למצב התקרה: הסך לא עלה, ולכן נספר אימון ראשון בלי שיפור.
    expect(progressOf(result, "ex-1")).toEqual({
      difficultyStep: 0,
      advice: "",
      stallCount: 1,
      ceilingStreak: 0,
    });
  });

  it("גם נגיעה בתקרה עם גומייה לא משאירה את ההשתקה: חוזרים לבדיקה הרגילה", async () => {
    const meta = item();
    const rows = sets(meta, [10, 7, 6]);
    rows[0] = { ...rows[0], banded: true };
    const result = await run({
      items: [meta],
      rows,
      states: new Map([["ex-1", state({ ceilingStreak: 1 })]]),
      history: [
        { workout_item_id: meta.id, difficulty_step: 0, logged_at: "x", total: 30 },
      ],
    });
    expect(progressOf(result, "ex-1")?.stallCount).toBe(1);
    expect(progressOf(result, "ex-1")?.ceilingStreak).toBe(1);
  });

  it("ציר חזרות לא מעלה דרגה ולא רושם הישג גם בתקרה נקייה", async () => {
    const meta = item();
    const result = await run({ items: [meta], rows: sets(meta, [10, 10, 10]) });
    expect(progressOf(result, "ex-1")?.difficultyStep).toBe(0);
    expect(eventsOf(result, "ex-1")).toHaveLength(0);
    expect(result.outcomes[meta.id]).toBeUndefined();
  });
});

describe("בדיקת התקיעות", () => {
  it("שני אימונים בלי שיפור: ההנחיה לרדת לתחתית, והמונה מתאפס", async () => {
    const meta = item();
    const result = await run({
      items: [meta],
      rows: sets(meta, [8, 8, 8]),
      states: new Map([["ex-1", state({ stallCount: 1 })]]),
      history: [
        { workout_item_id: meta.id, difficulty_step: 0, logged_at: "x", total: 24 },
      ],
    });
    expect(progressOf(result, "ex-1")).toEqual({
      difficultyStep: 0,
      advice: "easier",
      stallCount: 0,
      ceilingStreak: 0,
    });
  });

  it("אימון רע בודד לא מפעיל כלום", async () => {
    const meta = item();
    const result = await run({
      items: [meta],
      rows: sets(meta, [7, 7, 7]),
      history: [
        { workout_item_id: meta.id, difficulty_step: 0, logged_at: "x", total: 24 },
      ],
    });
    expect(progressOf(result, "ex-1")).toEqual({
      difficultyStep: 0,
      advice: "",
      stallCount: 1,
      ceilingStreak: 0,
    });
  });

  it("אימון שכולו אישורים בלי נגיעה אינו עדות לתקיעות: המונה נשאר כמו שהיה", async () => {
    const meta = item();
    const result = await run({
      items: [meta],
      rows: sets(meta, [8, 8, 8], { untouched: true }),
      states: new Map([["ex-1", state({ stallCount: 1 })]]),
      history: [
        { workout_item_id: meta.id, difficulty_step: 0, logged_at: "x", total: 24 },
      ],
    });
    expect(progressOf(result, "ex-1")).toEqual({
      difficultyStep: 0,
      advice: "",
      stallCount: 1,
      ceilingStreak: 0,
    });
  });

  it("בתרגיל חד־צדדי רק הצד החלש נמדד: עריכה בצד החזק בלבד אינה עדות", async () => {
    const meta = item({ unilateral: true });
    const weak = sets(meta, [8, 8, 8], { untouched: true });
    const strong = sets(meta, [9, 9, 9], { side: "strong", untouched: false });
    const result = await run({
      items: [meta],
      rows: [...weak, ...strong],
      states: new Map([["ex-1", state({ stallCount: 1 })]]),
      history: [
        { workout_item_id: meta.id, difficulty_step: 0, logged_at: "x", total: 24 },
      ],
    });
    // הצד החזק נערך, אבל הוא לא ראיה: המונה לא זז וההנחיה לא נשלפת.
    expect(progressOf(result, "ex-1")).toEqual({
      difficultyStep: 0,
      advice: "",
      stallCount: 1,
      ceilingStreak: 0,
    });
  });

  it("ההשוואה נעשית רק בתוך אותה דרגת קושי: היסטוריה מדרגה אחרת שקופה", async () => {
    const meta = item({ progression: "stance" });
    const result = await run({
      items: [meta],
      rows: sets(meta, [7, 7, 7]),
      states: new Map([["ex-1", state({ difficultyStep: 1, stallCount: 1 })]]),
      history: [
        { workout_item_id: meta.id, difficulty_step: 0, logged_at: "x", total: 30 },
      ],
    });
    // אין "פעם קודמת" בדרגה 1, ולכן אין תקיעה, למרות סך נמוך מדרגה 0.
    expect(progressOf(result, "ex-1")).toEqual({
      difficultyStep: 1,
      advice: "",
      stallCount: 0,
      ceilingStreak: 0,
    });
  });
});

describe("רמות מנח (הכרעת 13 באוגוסט: כל הסטים בתקרה, פעמיים ברצף, בלי גומייה)", () => {
  const leveled = () =>
    item({ progression: "stance", hasStanceLevels: true });

  it("תקרה נקייה ראשונה: הרצף עולה לאחת, בלי עליית רמה ובלי אירוע", async () => {
    const meta = leveled();
    const result = await run({ items: [meta], rows: sets(meta, [10, 10, 10]) });
    expect(progressOf(result, "ex-1")).toEqual({
      difficultyStep: 0,
      advice: "",
      stallCount: 0,
      ceilingStreak: 1,
    });
    expect(eventsOf(result, "ex-1")).toHaveLength(0);
  });

  it("תקרה נקייה שנייה ברצף: הרמה נפתחת, נרשם אירוע הישג, והמסך מקבל harder", async () => {
    const meta = leveled();
    const result = await run({
      items: [meta],
      rows: sets(meta, [10, 10, 10]),
      states: new Map([["ex-1", state({ ceilingStreak: 1 })]]),
    });
    expect(progressOf(result, "ex-1")).toEqual({
      difficultyStep: 1,
      advice: "harder",
      stallCount: 0,
      ceilingStreak: 0,
    });
    expect(eventsOf(result, "ex-1")).toHaveLength(1);
    expect(result.outcomes[meta.id]).toBe("harder");
  });

  it("תקרה בעזרת גומייה לא מקדמת את הסולם: הרמה נשארת, הרצף מתאפס, וההנחיה להיפרד ממנה", async () => {
    const meta = leveled();
    const result = await run({
      items: [meta],
      rows: sets(meta, [10, 10, 10], { banded: true }),
      states: new Map([["ex-1", state({ ceilingStreak: 1 })]]),
    });
    expect(progressOf(result, "ex-1")).toEqual({
      difficultyStep: 0,
      advice: "drop-band",
      stallCount: 0,
      ceilingStreak: 0,
    });
    expect(eventsOf(result, "ex-1")).toHaveLength(0);
  });

  it("סט אחד מתחת לתקרה לא פותח רמה ומאפס את הרצף", async () => {
    const meta = leveled();
    const result = await run({
      items: [meta],
      rows: sets(meta, [10, 10, 9]),
      states: new Map([["ex-1", state({ ceilingStreak: 1 })]]),
      history: [
        { workout_item_id: meta.id, difficulty_step: 0, logged_at: "x", total: 30 },
      ],
    });
    expect(progressOf(result, "ex-1")?.difficultyStep).toBe(0);
    expect(progressOf(result, "ex-1")?.ceilingStreak).toBe(0);
  });

  it("רמה 3 היא סוף הסולם: תקרה חוזרת לא רושמת אירוע ולא מבטיחה כלום", async () => {
    const meta = leveled();
    const result = await run({
      items: [meta],
      rows: sets(meta, [10, 10, 10]),
      states: new Map([["ex-1", state({ difficultyStep: 2, ceilingStreak: 1 })]]),
    });
    expect(progressOf(result, "ex-1")).toEqual({
      difficultyStep: 2,
      advice: "",
      stallCount: 0,
      ceilingStreak: 0,
    });
    expect(eventsOf(result, "ex-1")).toHaveLength(0);
    expect(result.outcomes[meta.id]).toBeUndefined();
  });

  it("הסולם שייך לתרגיל: המצב נקרא לפי exercise_id גם כשמזהה הפריט שונה", async () => {
    const meta = item({
      id: "item-other",
      exerciseId: "ex-shared",
      progression: "stance",
      hasStanceLevels: true,
    });
    const result = await run({
      items: [meta],
      rows: sets(meta, [10, 10, 10]),
      states: new Map([["ex-shared", state({ ceilingStreak: 1 })]]),
    });
    // הרצף שנצבר תחת התרגיל נספר גם בפריט הזה, והרמה נפתחת.
    expect(progressOf(result, "ex-shared")?.difficultyStep).toBe(1);
  });
});

describe("מנח בלי רמות", () => {
  const stance = () => item({ progression: "stance", hasStanceLevels: false });

  it("תקרה נקייה בכל הסטים: דרגה למעלה מיד והנחיה להקשות", async () => {
    const meta = stance();
    const result = await run({ items: [meta], rows: sets(meta, [10, 10, 10]) });
    expect(progressOf(result, "ex-1")).toEqual({
      difficultyStep: 1,
      advice: "harder",
      stallCount: 0,
      ceilingStreak: 0,
    });
    expect(eventsOf(result, "ex-1")).toHaveLength(1);
  });

  it("תקרה עם גומייה בחלק מהסטים בלבד: אין הישג אחיד ואין עליית דרגה", async () => {
    const meta = stance();
    const rows = sets(meta, [10, 10, 10]);
    rows[0] = { ...rows[0], banded: true };
    const result = await run({ items: [meta], rows });
    expect(progressOf(result, "ex-1")?.difficultyStep).toBe(0);
    expect(eventsOf(result, "ex-1")).toHaveLength(0);
  });
});

describe("גבולות המנוע", () => {
  it("amrap נשאר מחוץ למנגנון: שום כתיבה ושום הישג", async () => {
    const meta = item({ type: "amrap", reps: null, seconds: 60 });
    const result = await run({
      items: [meta],
      rows: sets(item({ type: "reps" }), [20, 20, 20]),
    });
    expect(result.statements).toHaveLength(0);
    expect(result.outcomes).toEqual({});
  });

  it("תרגיל החזקה נמדד בשניות: תקרה לפי seconds גם כשהרצף מתחיל", async () => {
    const meta = item({ type: "hold", reps: null, seconds: 45, progression: "time" });
    const result = await run({ items: [meta], rows: sets(meta, [45, 45, 45]) });
    expect(progressOf(result, "ex-1")?.ceilingStreak).toBe(1);
  });

  it("סט כפול נדחה", async () => {
    const meta = item();
    const rows = [...sets(meta, [8, 8, 8]), ...sets(meta, [8])];
    await expect(run({ items: [meta], rows })).rejects.toThrow();
  });

  it("מספר סט מעל התוכנית נדחה", async () => {
    const meta = item({ sets: 2 });
    await expect(
      run({ items: [meta], rows: sets(meta, [8, 8, 8]) })
    ).rejects.toThrow();
  });

  it("צד על תרגיל דו־צדדי נדחה, וחוסר צד על חד־צדדי נדחה", async () => {
    const bilateral = item();
    await expect(
      run({
        items: [bilateral],
        rows: sets(bilateral, [8], { side: "weak" }),
      })
    ).rejects.toThrow();

    const unilateral = item({ unilateral: true });
    await expect(
      run({
        items: [unilateral],
        rows: sets(unilateral, [8], { side: null }),
      })
    ).rejects.toThrow();
  });
});

describe("טווח העבודה", () => {
  it("תחתית שנקבעה בתוכנית גוברת על ברירת המחדל", () => {
    expect(rangeFloor({ targetMin: 5, reps: 10, seconds: null })).toBe(5);
  });

  it("בלי תחתית: 60 אחוז מהתקרה, מעוגל", () => {
    expect(rangeFloor({ targetMin: null, reps: 10, seconds: null })).toBe(6);
    expect(rangeFloor({ targetMin: null, reps: null, seconds: 45 })).toBe(27);
  });

  it("התחתית לעולם לא יורדת מתחת לאחת", () => {
    expect(rangeFloor({ targetMin: null, reps: 1, seconds: null })).toBe(1);
  });

  it("בלי תקרה אין טווח", () => {
    expect(rangeFloor({ targetMin: null, reps: null, seconds: null })).toBeNull();
  });
});

describe("אימוני התאוששות", () => {
  it("אחרי כל 12 אימונים באים שניים מוקלים", () => {
    expect(isRecoverySession(11)).toBe(false);
    expect(isRecoverySession(12)).toBe(true);
    expect(isRecoverySession(13)).toBe(true);
    expect(isRecoverySession(14)).toBe(false);
    expect(isRecoverySession(24)).toBe(true);
    expect(isRecoverySession(25)).toBe(true);
  });

  it("חצי מהסטים, ולעולם לא פחות מסט אחד", () => {
    expect(recoverySets(4)).toBe(2);
    expect(recoverySets(3)).toBe(2);
    expect(recoverySets(1)).toBe(1);
  });
});
