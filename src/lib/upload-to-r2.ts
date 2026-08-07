"use client";

/**
 * העלאת קובץ מהדפדפן ישירות ל-R2.
 *
 * שני שלבים: השרת חותם כתובת, והדפדפן שולח אליה PUT. הקובץ לא עובר
 * דרך השרת שלנו בכלל, ולכן מגבלת גוף הבקשה לא נוגעת בו.
 *
 * XMLHttpRequest ולא fetch, בכוונה. fetch לא מדווח על התקדמות העלאה,
 * ומד ההתקדמות הוא מה שמפריד בין העלאה של קליפ כבד לבין מסך תקוע.
 *
 * PUT יחיד ולא רב-חלקי: R2 מקבל עד חמישה ג'יגה בבקשה אחת, והתקרה כאן
 * היא שלוש מאות מגה. חלוקה לחלקים הייתה מוסיפה שלוש קריאות שרת נוספות
 * בלי להרוויח כלום.
 */

export type Presigned = {
  uploadUrl: string;
  contentType: string;
  /** הכתובת הציבורית שתירשם במסד אחרי שההעלאה תצליח. */
  url: string;
};

/** מבקש כתובת חתומה, ואז מעלה אליה. מחזיר את הכתובת הציבורית. */
export async function uploadToR2({
  file,
  signUrl,
  body,
  onProgress,
}: {
  file: File;
  /** המסלול שמנפיק את החתימה. */
  signUrl: string;
  /** שדות נוספים שהמסלול החותם צריך, מעבר לשם ולגודל. */
  body?: Record<string, unknown>;
  onProgress?: (percent: number) => void;
}): Promise<string> {
  const signRes = await fetch(signUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, size: file.size, ...body }),
  });
  if (!signRes.ok) {
    const data = await signRes.json().catch(() => ({}));
    throw new Error(data.error || "לא הצלחנו לפתוח העלאה");
  }
  const signed = (await signRes.json()) as Presigned;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signed.uploadUrl, true);
    // חייב להיות זהה לסוג שנחתם, אחרת R2 דוחה את החתימה.
    xhr.setRequestHeader("Content-Type", signed.contentType);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !onProgress) return;
      onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`ההעלאה לאחסון נכשלה (${xhr.status})`));
    };

    // הדפדפן לא מגלה למה בקשה חוצת־מקורות נחסמה, ולכן ההודעה מכוונת
    // למה שבאמת קורה כאן: מדיניות CORS על הדלי שעוד לא הוגדרה.
    xhr.onerror = () =>
      reject(new Error("החיבור לאחסון נכשל. ייתכן שהרשאות הגישה לדלי חסרות."));
    xhr.onabort = () => reject(new Error("ההעלאה בוטלה"));

    xhr.send(file);
  });

  return signed.url;
}
