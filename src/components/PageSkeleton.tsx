/**
 * שלד המסך שמוצג בזמן מעבר בין לשוניות.
 *
 * למה זה קיים: כל המסכים נבנים בשרת ושואבים מהמסד. בלי שלד, לחיצה על
 * לשונית משאירה את המסך הקודם קפוא עד שהשרת עונה, ואז הכל מופיע בבת
 * אחת. זה מרגיש כבד גם כשהשרת מהיר. עם שלד המסך החדש נכנס מיד.
 *
 * הכל CSS, בלי JavaScript ובלי אנימציות ספרייה, כדי שייראה עוד לפני
 * שהקוד של הדף נטען.
 *
 * המידות מחקות את המסך האמיתי בכוונה, כדי שהתוכן לא יקפוץ כשהוא מגיע.
 */
export default function PageSkeleton({
  variant = "home",
}: {
  variant?: "home" | "list" | "text";
}) {
  return (
    <main
      className="relative min-h-dvh overflow-hidden grain"
      aria-busy="true"
      aria-label="טוען"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 45% at 50% -6%, rgba(180,133,79,.13), transparent 62%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pt-2 pb-10">
        {variant === "text" ? (
          <>
            <div className="skeleton h-4 w-16 rounded" />
            <div className="skeleton mt-6 mb-6 h-9 w-40 rounded-lg" />
            <div className="space-y-3">
              {[92, 78, 88, 64].map((w, i) => (
                <div key={i} className="skeleton h-4 rounded" style={{ width: `${w}%` }} />
              ))}
            </div>
            <div className="mt-8 space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-20 w-full rounded-3xl" />
              ))}
            </div>
          </>
        ) : variant === "list" ? (
          <>
            <div className="skeleton h-4 w-16 rounded" />
            <div className="skeleton mt-6 mb-2 h-9 w-36 rounded-lg" />
            <div className="skeleton mb-6 h-4 w-56 rounded" />
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-24 w-full rounded-3xl" />
              ))}
            </div>
          </>
        ) : (
          <>
            {/* ברכה ושם */}
            <div className="skeleton h-4 w-20 rounded" />
            <div className="skeleton mt-2 mb-7 h-9 w-40 rounded-lg" />

            {/* שני מלבני נתונים */}
            <div className="mb-6 grid grid-cols-2 gap-2.5">
              <div className="skeleton h-[86px] rounded-3xl" />
              <div className="skeleton h-[86px] rounded-3xl" />
            </div>

            {/* רשימה */}
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-28 w-full rounded-3xl" />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
