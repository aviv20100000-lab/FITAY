import { describe, expect, it } from "vitest";
import {
  ceilingOf,
  prescriptions,
  previousSetValue,
  targetValue,
  type PrescriptionInput,
} from "@/lib/progression-core";

/*
 * המרשם הוא המספר שהאפליקציה מציעה לסט הבא. מאז האיחוד הוא מחושב פעם
 * אחת, בשרת, בליבה הזאת, והלקוח רק מציג. הבדיקות מצמידות אותו להבטחות
 * של הכרטיסים ולהכרעות של 13 באוגוסט 2026, כי הסטיות בו שקטות: אף אחד
 * לא מבחין במספר מוצע שגוי במשך שבועות.
 */

function input(over: Partial<PrescriptionInput> = {}): PrescriptionInput {
  return {
    type: "reps",
    progression: "reps",
    reps: 10,
    seconds: null,
    floor: 6,
    seenBefore: false,
    advice: "",
    lastSets: null,
    ...over,
  };
}

function last(values: number[], hold = false) {
  return values.map((v) => ({
    reps: hold ? null : v,
    seconds: hold ? v : null,
  }));
}

describe("ההנחיה והמילוי אומרים את אותו דבר", () => {
  it("אחרי easier המילוי הוא תחתית הטווח, לא הביצוע הקודם ועוד תוספת", () => {
    expect(
      targetValue(input({ advice: "easier", lastSets: last([10, 10, 10]) }), 1)
    ).toBe(6);
  });

  it("אחרי drop-band המילוי הוא תחתית הטווח", () => {
    expect(
      targetValue(
        input({
          progression: "stance",
          advice: "drop-band",
          lastSets: last([10, 10, 10]),
        }),
        1
      )
    ).toBe(6);
  });
});

describe("תרגיל בלי היסטוריה בדרגה הנוכחית", () => {
  it("תרגיל חדש מתחיל מתחתית הטווח", () => {
    expect(targetValue(input(), 1)).toBe(6);
  });

  it("סט ראשון אחרי הקשיה מתחיל מהתחתית: ההיסטוריה של הדרגה הקודמת לא נראית", () => {
    // השרת מסנן את הביצוע האחרון לפי הדרגה הנוכחית, ולכן אחרי הקשיה
    // lastSets מגיע ריק. המילוי חייב ליפול לתחתית ולא לתקרה.
    expect(
      targetValue(input({ progression: "stance", lastSets: null }), 1)
    ).toBe(6);
  });

  it("מעבר שלב בציר חזרות: תרגיל מוכר נפתח במקסימום הטווח (הכרעת 13 באוגוסט)", () => {
    expect(targetValue(input({ seenBefore: true }), 1)).toBe(10);
  });

  it("מעבר שלב בציר זמן: אותו כלל, לפי שדה השניות", () => {
    const hold = input({
      type: "hold",
      progression: "time",
      reps: null,
      seconds: 45,
      floor: 27,
      seenBefore: true,
    });
    expect(targetValue(hold, 1)).toBe(45);
  });

  it("תרגיל מנח מוכר לא נפתח בתקרה: הסולם שלו מתאפס עם הריצה", () => {
    expect(
      targetValue(input({ progression: "stance", seenBefore: true }), 1)
    ).toBe(6);
  });

  it("amrap מוכר לא יורש את משך הסט כחזרות", () => {
    const amrap = input({
      type: "amrap",
      reps: null,
      seconds: 60,
      floor: null,
      seenBefore: true,
    });
    // הערך המדויק: ברירת המחדל של חזרות בקוד, בלי שום ירושה ממשך הסט.
    expect(targetValue(amrap, 1)).toBe(10);
  });
});

describe("טיפוס מעל הביצוע הקודם", () => {
  it("חזרות: הביצוע הקודם של אותו סט ועוד אחת", () => {
    const it1 = input({ lastSets: last([7, 6, 6]) });
    expect(targetValue(it1, 1)).toBe(8);
    expect(targetValue(it1, 2)).toBe(7);
  });

  it("החזקה: הביצוע הקודם ועוד חמש שניות", () => {
    const hold = input({
      type: "hold",
      progression: "time",
      reps: null,
      seconds: 45,
      floor: 27,
      lastSets: last([30, 30, 30], true),
    });
    expect(targetValue(hold, 1)).toBe(35);
  });

  it("התקרה עוצרת את הטיפוס בכל הצירים (הכרעת 13 באוגוסט)", () => {
    expect(targetValue(input({ lastSets: last([10, 10, 10]) }), 1)).toBe(10);
    const hold = input({
      type: "hold",
      progression: "time",
      reps: null,
      seconds: 45,
      floor: 27,
      lastSets: last([43, 43, 43], true),
    });
    expect(targetValue(hold, 1)).toBe(45);
  });
});

describe("הביצוע הקודם לפי סט", () => {
  it("כל סט נשען על מקבילו מהפעם הקודמת, לא על הסט הראשון", () => {
    const it1 = input({ lastSets: last([12, 10, 8]) });
    expect(previousSetValue(it1, 1)).toBe(12);
    expect(previousSetValue(it1, 2)).toBe(10);
    expect(previousSetValue(it1, 3)).toBe(8);
  });

  it("סט שלא היה בפעם הקודמת, למשל אחרי אימון התאוששות, נשען על האחרון שנרשם", () => {
    expect(previousSetValue(input({ lastSets: last([12, 10]) }), 3)).toBe(10);
  });

  it("בלי היסטוריה אין ביצוע קודם", () => {
    expect(previousSetValue(input(), 1)).toBeNull();
  });
});

describe("המרשם המלא שנשלח למסך", () => {
  it("מספר לכל סט, כל אחד לפי ההיסטוריה שלו", () => {
    expect(prescriptions(input({ lastSets: last([9, 7, 6]) }), 3)).toEqual([
      10, 8, 7,
    ]);
  });

  it("באימון התאוששות עם חצי מהסטים נשלחים בדיוק כמספר הסטים המוצגים", () => {
    expect(prescriptions(input({ lastSets: last([9, 7, 6]) }), 2)).toEqual([
      10, 8,
    ]);
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
    const odd = input({
      type: "hold",
      progression: "time",
      reps: 8,
      seconds: null,
      floor: 5,
      lastSets: last([7, 7, 7], true),
    });
    const ceiling = ceilingOf(odd);
    expect(ceiling).toBe(8);
    for (let set = 1; set <= 3; set++) {
      expect(targetValue(odd, set)).toBeLessThanOrEqual(ceiling as number);
    }
  });
});
