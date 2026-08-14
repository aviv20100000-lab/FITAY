import { describe, expect, it } from "vitest";
import {
  ceilingOf,
  previousSetValue,
  targetValue,
  type Item,
} from "@/app/client/workout/[id]/WorkoutRunner";
import type { LastPerformance } from "@/lib/types";

/*
 * המילוי במסך האימון הוא המרשם: המספר שהאפליקציה מציעה לסט הבא. הבדיקות
 * כאן מצמידות אותו להבטחות של הכרטיסים ולהכרעות של 13 באוגוסט 2026, כי
 * הסטיות בו שקטות: אף אחד לא מבחין במספר מוצע שגוי במשך שבועות.
 */

function item(over: Partial<Item> = {}): Item {
  return {
    id: "item-1",
    exerciseId: "ex-1",
    name: "תרגיל",
    description: "",
    technique: [],
    tips: [],
    tempo: "",
    muscles: "",
    type: "reps",
    progression: "reps",
    hasStanceLevels: false,
    stanceLevelCount: 1,
    unilateral: false,
    bandAllowed: false,
    sets: 3,
    reps: 10,
    seconds: null,
    floor: 6,
    rangeSet: true,
    seenBefore: false,
    advice: "",
    difficultyStep: 0,
    ceilingStreak: 0,
    rest: 60,
    ringHeight: null,
    bodyAngle: null,
    coachNote: "",
    videoFile: null,
    posterUrl: null,
    bandVideoFile: null,
    bandPosterUrl: null,
    last: null,
    ...over,
  };
}

function last(values: number[], hold = false): LastPerformance {
  return {
    loggedAt: "2026-08-10T10:00:00.000Z",
    sets: values.map((v) => ({
      reps: hold ? null : v,
      seconds: hold ? v : null,
      side: null,
      banded: false,
      bandLevel: null,
    })),
    total: values.reduce((sum, v) => sum + v, 0),
    anyBanded: false,
  };
}

describe("ההנחיה והמילוי אומרים את אותו דבר", () => {
  it("אחרי easier המילוי הוא תחתית הטווח, לא הביצוע הקודם ועוד תוספת", () => {
    const it1 = item({ advice: "easier", last: last([10, 10, 10]) });
    expect(targetValue(it1, 1)).toBe(6);
  });

  it("אחרי drop-band המילוי הוא תחתית הטווח", () => {
    const it1 = item({
      progression: "stance",
      hasStanceLevels: true,
      stanceLevelCount: 3,
      advice: "drop-band",
      last: last([10, 10, 10]),
    });
    expect(targetValue(it1, 1)).toBe(6);
  });
});

describe("תרגיל בלי היסטוריה בדרגה הנוכחית", () => {
  it("תרגיל חדש מתחיל מתחתית הטווח", () => {
    expect(targetValue(item(), 1)).toBe(6);
  });

  it("סט ראשון אחרי הקשיה מתחיל מהתחתית: ההיסטוריה של הדרגה הקודמת לא נראית", () => {
    // page.tsx מסנן את הביצוע האחרון לפי הדרגה הנוכחית, ולכן אחרי הקשיה
    // last מגיע ריק. המילוי חייב ליפול לתחתית ולא לתקרה.
    const it1 = item({
      progression: "stance",
      hasStanceLevels: true,
      stanceLevelCount: 3,
      difficultyStep: 1,
      last: null,
    });
    expect(targetValue(it1, 1)).toBe(6);
  });

  it("מעבר שלב בציר חזרות: תרגיל מוכר נפתח במקסימום הטווח (הכרעת 13 באוגוסט)", () => {
    expect(targetValue(item({ seenBefore: true }), 1)).toBe(10);
  });

  it("מעבר שלב בציר זמן: אותו כלל, לפי שדה השניות", () => {
    const it1 = item({
      type: "hold",
      progression: "time",
      reps: null,
      seconds: 45,
      floor: 27,
      seenBefore: true,
    });
    expect(targetValue(it1, 1)).toBe(45);
  });

  it("תרגיל מנח מוכר לא נפתח בתקרה: הסולם שלו מתאפס עם הריצה", () => {
    const it1 = item({ progression: "stance", seenBefore: true });
    expect(targetValue(it1, 1)).toBe(6);
  });

  it("amrap מוכר לא יורש את משך הסט כחזרות", () => {
    const it1 = item({
      type: "amrap",
      reps: null,
      seconds: 60,
      floor: null,
      seenBefore: true,
    });
    expect(targetValue(it1, 1)).not.toBe(60);
  });
});

describe("טיפוס מעל הביצוע הקודם", () => {
  it("חזרות: הביצוע הקודם של אותו סט ועוד אחת", () => {
    const it1 = item({ last: last([7, 6, 6]) });
    expect(targetValue(it1, 1)).toBe(8);
    expect(targetValue(it1, 2)).toBe(7);
  });

  it("החזקה: הביצוע הקודם ועוד חמש שניות", () => {
    const it1 = item({
      type: "hold",
      progression: "time",
      reps: null,
      seconds: 45,
      floor: 27,
      last: last([30, 30, 30], true),
    });
    expect(targetValue(it1, 1)).toBe(35);
  });

  it("התקרה עוצרת את הטיפוס בכל הצירים (הכרעת 13 באוגוסט)", () => {
    const it1 = item({ last: last([10, 10, 10]) });
    expect(targetValue(it1, 1)).toBe(10);
    const hold = item({
      type: "hold",
      progression: "time",
      reps: null,
      seconds: 45,
      floor: 27,
      last: last([43, 43, 43], true),
    });
    expect(targetValue(hold, 1)).toBe(45);
  });
});

describe("הביצוע הקודם לפי סט", () => {
  it("כל סט נשען על מקבילו מהפעם הקודמת, לא על הסט הראשון", () => {
    const it1 = item({ last: last([12, 10, 8]) });
    expect(previousSetValue(it1, 1)).toBe(12);
    expect(previousSetValue(it1, 2)).toBe(10);
    expect(previousSetValue(it1, 3)).toBe(8);
  });

  it("סט שלא היה בפעם הקודמת, למשל אחרי אימון התאוששות, נשען על האחרון שנרשם", () => {
    const it1 = item({ last: last([12, 10]) });
    expect(previousSetValue(it1, 3)).toBe(10);
  });

  it("בלי היסטוריה אין ביצוע קודם", () => {
    expect(previousSetValue(item(), 1)).toBeNull();
  });
});

describe("תקרה אחת לכל המסך", () => {
  it("חזרות לפי reps, החזקה לפי seconds, amrap לפי משך הסט", () => {
    expect(ceilingOf({ type: "reps", reps: 10, seconds: null })).toBe(10);
    expect(ceilingOf({ type: "hold", reps: null, seconds: 45 })).toBe(45);
    expect(ceilingOf({ type: "amrap", reps: null, seconds: 60 })).toBe(60);
  });

  it("ערך שנשמר בשדה הלא נכון עדיין נותן תקרה אחת ולא שתיים", () => {
    // הבאג שנתפס בעין: תצוגה שנפלה לשדה השני בזמן שהמילוי קרא רק את
    // השדה של הסוג, ואותו כרטיס הראה טווח 5–8 עם הצעה של 30.
    expect(ceilingOf({ type: "hold", reps: 8, seconds: null })).toBe(8);
    expect(ceilingOf({ type: "reps", reps: null, seconds: 30 })).toBe(30);
  });

  it("המילוי נעצר באותה תקרה שהמסך מציג גם כשהערך בשדה הלא נכון", () => {
    const odd = item({ type: "hold", reps: 8, seconds: null, floor: 5, last: last([7, 7, 7], true) });
    const ceiling = ceilingOf(odd);
    expect(ceiling).toBe(8);
    for (let set = 1; set <= 3; set++) {
      expect(targetValue(odd, set)).toBeLessThanOrEqual(ceiling as number);
    }
  });
});
