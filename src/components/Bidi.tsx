/**
 * טקסט עברי שמשובצים בו מספרים או מילים לועזיות.
 *
 * "0 / 24" או "2 × 10" בתוך פסקה בעברית מוצגים הפוכים ("24 / 0"), כי
 * הדפדפן קורא מספרים כרצף חלש (bidi) שנעטף מחדש לפי כיוון הטקסט מסביב.
 * העטיפה כאן נגזרת מהטקסט עצמו: כל רצף ספרות/אותיות, כולל שרשראות
 * שמחוברות ב-"/" "×" "–" "*" "+" "·" ":" נעטף ב-span עם dir="ltr" כדי
 * שיישאר בסדר שבו הוא נכתב.
 */
const BIDI_PATTERN =
  /([A-Za-z]+[A-Za-z0-9]*|\d+(?:\s*[/×:·*–-]\s*\d+)+|[+\-×]\d+|\d+\*)/g;

export function Bidi({ text }: { text: string }) {
  const parts = text.split(BIDI_PATTERN);
  return (
    <>
      {parts.map((part, index) =>
        part && /[A-Za-z0-9]/.test(part) ? (
          <span key={index} dir="ltr" className="inline-block">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}
