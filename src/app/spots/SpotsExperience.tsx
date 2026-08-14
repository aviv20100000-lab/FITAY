"use client";

import { useCallback, useRef, useState } from "react";
import FitayIcon from "@/components/FitayIcon";
import { searchLocalities, type Locality } from "@/lib/localities";
import type { Spot } from "@/lib/spots";

/**
 * מסך המתחים.
 *
 * שלוש החלטות שמחזיקות אותו:
 *
 * המיקום נדרש רק בלחיצה. חלונית ההרשאה של הדפדפן שקופצת מיד עם טעינת
 * המסך מרגישה פולשנית, ומי שלוחץ "חסום" פעם אחת נשאר עם מסך מת לתמיד.
 * כאן היא מגיעה אחרי כפתור, ואחרי משפט שמסביר בשביל מה.
 *
 * למי שסירב או שאין לו קליטה יש בחירת עיר. הרשימה תהיה פחות מדויקת,
 * וזה עדיין הרבה יותר טוב ממסך שלא עושה כלום.
 *
 * הוספת מתח פתוחה רק ממיקום אמיתי. מי שבחר עיר מהרשימה נמצא בשגיאה של
 * קילומטרים, ונקודה כזאת במסד גרועה מהיעדר נקודה.
 */

type Origin = { lat: number; lng: number; label: string; precise: boolean };

/** ערי עוגן לחיפוש בלי GPS. מרכז העיר בערך, וזה כל מה שנדרש כאן. */
/*
 * רשימת שש עשרה הערים שהייתה כאן ירדה.
 *
 * מי שגר ביישוב שלא היה בה פשוט לא הופיע, וזה רוב היישובים בישראל.
 * במקומה יש חיפוש חופשי מעל רשימת היישובים המלאה ב-lib/localities.
 */

/**
 * המתח הדהוי שיוצא מהמסגרת. אותו תפקיד בדיוק כמו הטבעת במסך הבית
 * ובמדריך: עומק מתוך הלוח עצמו, במקום עוד מלבן על הדף.
 */
function BarMark() {
  return (
    <div
      className="pointer-events-none absolute -left-6 -top-4 opacity-[.14]"
      aria-hidden="true"
    >
      <FitayIcon name="bar" size={190} />
    </div>
  );
}

/** "320 מ'" או "4.7 ק"מ". שלם מתחת לקילומטר, אין משמעות לעשירית מטר. */
function formatDistance(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} מ'`;
  return `${km.toFixed(1)} ק"מ`;
}

export default function SpotsExperience({ role }: { role: "coach" | "trainee" }) {
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [radiusKm, setRadiusKm] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pickingCity, setPickingCity] = useState(false);
  /** מה שהוקלד בשדה היישוב. ריק כשהשדה סגור. */
  const [cityQuery, setCityQuery] = useState("");
  const cityInputRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const load = useCallback(
    async (next: Origin, withHidden = showHidden) => {
      setBusy(true);
      setError("");
      try {
        const params = new URLSearchParams({
          lat: String(next.lat),
          lng: String(next.lng),
        });
        if (role === "coach" && withHidden) params.set("hidden", "1");
        const res = await fetch(`/api/spots?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "משהו השתבש");
        setSpots(data.spots as Spot[]);
        setRadiusKm(Number(data.radiusKm));
        setOrigin(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "משהו השתבש");
      } finally {
        setBusy(false);
      }
    },
    [role, showHidden]
  );

  const locate = useCallback(() => {
    setPickingCity(false);
    setNotice("");
    if (!("geolocation" in navigator)) {
      setError("הדפדפן הזה לא יודע לאתר מיקום. אפשר לבחור עיר מהרשימה.");
      setPickingCity(true);
      return;
    }

    setBusy(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void load({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "המיקום שלך",
          precise: true,
        });
      },
      (err) => {
        setBusy(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "הגישה למיקום חסומה. אפשר לפתוח אותה בהגדרות הדפדפן, או לבחור עיר מהרשימה."
            : "לא הצלחנו לאתר אותך. אפשר לנסות שוב או לבחור עיר מהרשימה."
        );
        setPickingCity(true);
      },
      // דיוק גבוה: ההבדל בין מאתיים מטר לשני קילומטר הוא ההבדל בין
      // רשימה שימושית לרשימה מקרית.
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }, [load]);

  const toggleHidden = useCallback(() => {
    const next = !showHidden;
    setShowHidden(next);
    if (origin) void load(origin, next);
  }, [showHidden, origin, load]);

  return (
    /*
      בלי min-h-dvh, בכוונה.

      המעטפת כבר מוסיפה כותרת למעלה ורווח של 96 פיקסל לסרגל למטה. מסך
      בגובה מסך מלא ביניהם דוחף את הדף לכ-185 פיקסל מעבר לגובה החלון,
      ואז מתחת לתוכן נפתח שטח ריק שאפשר לגלול אליו ואין בו כלום. בשאר
      המסכים התוכן ארוך וזה לא מורגש, כאן לפני איתור המיקום יש כרטיס
      אחד קטן, והריק הזה הוא רוב המסך.

      הרקע לא הולך לאיבוד: .client-surface היא בגובה מסך מלא וצובעת.
    */
    <main className="relative overflow-hidden grain">
      <div className="relative z-10 mx-auto w-full max-w-md px-5 pb-10 pt-2">
        {/* אותה כותרת בדיוק כמו "שאלות נפוצות" במדריך: שחור שמן, מילה בזהב, קו דוהה. */}
        <div className="mb-1 flex items-center gap-3">
          <h1 className="shrink-0 text-[1.7rem] font-black leading-tight tracking-[-.025em]">
            מתחים <span className="wood-text">בסביבה</span>
          </h1>
          <span className="h-px flex-1 bg-gradient-to-l from-[#b4854f]/45 to-transparent" />
        </div>
        {/*
          כותרת המשנה ירדה. "מתחים בסביבה" כבר אומרת מה זה, והלוח שמתחת
          אומר מה עושים. משפט שמסביר את שניהם הוא ממשק שמתנצל.
        */}
        <div className="mb-6" />

        {!origin && !pickingCity && (
          <>
            {/*
              לוח אטום עם צל, לא כרטיס זכוכית.

              זה המסך היחיד שיש בו פעולה אחת חשובה, והיא ישבה עד עכשיו
              באותו בגד כמו ההסבר שמתחתיה. האייקון גם עבר מאיור בשורה
              לסימן מים שיוצא מהמסגרת, כמו הטבעת במסך הבית ובמדריך: זה
              מה שנותן לעמוד עומק בלי להוסיף עוד מלבן.
            */}
            <section
              className="relative mb-8 overflow-hidden rounded-[2rem] px-6 pb-6 pt-7"
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border-1)",
                boxShadow: "var(--panel-shadow)",
              }}
            >
              <BarMark />
              <h2 className="relative text-[1.9rem] font-black leading-[1.05] tracking-[-.04em]">
                איפה תולים
                <br />
                <span className="wood-text">את הטבעות</span>
              </h2>
              <div className="mb-6" />
              <button
                type="button"
                onClick={locate}
                disabled={busy}
                className="wood relative min-h-14 w-full rounded-2xl text-lg font-extrabold"
                style={{ color: "var(--on-wood)" }}
              >
                {busy ? "מאתרים…" : "איתור מתח קרוב"}
              </button>
              <button
                type="button"
                onClick={() => setPickingCity(true)}
                className="relative mt-3 min-h-11 w-full text-sm font-bold"
                style={{ color: "var(--wood-1)" }}
              >
                או לפי שם היישוב
              </button>
            </section>

            {/*
              הסבר, לא פעולה. קודם הוא ישב בכרטיס זהה לזה של הכפתור
              ולכן התחרה בו. עכשיו שורות על הדף עם קווי הפרדה דקים,
              שפת הרשימות של FITAY.
            */}
            <section className="mb-4">
              <div className="flex items-center gap-3 pb-1">
                <h2 className="shrink-0 text-base font-black">
                  כך זה <span className="wood-text">עובד</span>
                </h2>
                <span className="h-px flex-1 bg-gradient-to-l from-[#b4854f]/45 to-transparent" />
              </div>
              {[
                "מוצאים מתח קרוב, הרשימה מסודרת לפי מרחק.",
                "מנווטים אליו בלחיצה אחת.",
                "תולים את הטבעות ומתאמנים.",
              ].map((text, index) => (
                <div
                  key={text}
                  className="flex min-h-12 items-center gap-3 py-2.5"
                  style={{ borderTop: index === 0 ? "none" : "1px solid var(--line)" }}
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-black tabular-nums"
                    style={{
                      background: "rgba(180,133,79,.12)",
                      border: "1px solid rgba(180,133,79,.4)",
                      color: "var(--wood-1)",
                    }}
                  >
                    {index + 1}
                  </span>
                  <p className="text-sm font-semibold leading-5">{text}</p>
                </div>
              ))}
            </section>
          </>
        )}

        {error && (
          <p
            className="mb-4 rounded-2xl px-4 py-3 text-sm leading-relaxed"
            style={{ background: "var(--surface-2)", color: "var(--danger-text)" }}
          >
            {error}
          </p>
        )}

        {pickingCity && (
          /* אותו לוח של המצב הקודם. מעבר בין שני בגדים על אותו מסך היה
             נקרא כמעבר בין שני מסכים. */
          <section
            className="relative mb-8 overflow-hidden rounded-[2rem] px-6 pb-6 pt-7"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border-1)",
              boxShadow: "var(--panel-shadow)",
            }}
          >
            <BarMark />
            {/*
              הכותרת מתכווצת ברגע שמתחילים להקליד.

              באייפון המקלדת תופסת כמחצית מגובה המסך, והלוח בגובהו המלא
              דחף את שדה הקלט ואת ההצעות אל מתחת לה. מי שהקליד שם יישוב
              פשוט לא ראה מה מוצע לו.
            */}
            {cityQuery.trim() ? (
              <h2 className="relative mb-3 text-lg font-black">
                איפה אתה <span className="wood-text">מתאמן</span>
              </h2>
            ) : (
              <h2 className="relative mb-5 text-[1.9rem] font-black leading-[1.05] tracking-[-.04em]">
                איפה אתה
                <br />
                <span className="wood-text">מתאמן</span>
              </h2>
            )}

            {/*
              שדה ולא רשימת שבבים. שש עשרה ערים כיסו את המרכז והשאירו בחוץ
              את רוב היישובים בישראל, וזו בדיוק האוכלוסייה שאין לה חדר כושר
              מעבר לפינה.
            */}
            <input
              ref={cityInputRef}
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              /*
                גלילה של השדה אל ראש המסך ברגע שנוגעים בו. בלי זה המקלדת
                עולה מתחתיו ורשימת ההצעות נופלת מחוץ לשטח הנראה. ההשהיה
                היא בשביל המקלדת: היא משנה את גובה החלון אחרי הפוקוס.
              */
              onFocus={() => {
                setTimeout(() => {
                  cityInputRef.current?.scrollIntoView({
                    block: "start",
                    behavior: "smooth",
                  });
                }, 250);
              }}
              placeholder="שם היישוב"
              autoFocus
              className="relative mb-1 min-h-14 w-full rounded-2xl px-4 text-lg font-bold outline-none"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--wood-border)",
                color: "var(--text)",
              }}
            />

            {(() => {
              const matches: Locality[] = searchLocalities(cityQuery);
              if (!cityQuery.trim()) return null;
              if (matches.length === 0) {
                return (
                  <p className="relative py-2 text-sm" style={{ color: "var(--dim)" }}>
                    לא מצאנו יישוב בשם הזה. אפשר לנסות איות אחר, או לאתר לפי מיקום.
                  </p>
                );
              }
              return (
                <div className="relative">
                  {matches.map((city, index) => (
                    <button
                      key={city.name}
                      type="button"
                      onClick={() => {
                        setPickingCity(false);
                        setCityQuery("");
                        void load({
                          lat: city.lat,
                          lng: city.lng,
                          label: city.name,
                          precise: false,
                        });
                      }}
                      className="relative flex min-h-12 w-full items-center py-2.5 text-right font-bold"
                      style={{
                        borderTop: index === 0 ? "none" : "1px solid var(--line)",
                        color: "var(--wood-1)",
                      }}
                    >
                      {city.name}
                    </button>
                  ))}
                </div>
              );
            })()}
            <button
              type="button"
              onClick={locate}
              className="mt-4 min-h-11 text-sm font-semibold"
              style={{ color: "var(--wood-1)" }}
            >
              לאתר אותי שוב
            </button>
          </section>
        )}

        {origin && (
          /*
            כותרת ולא שורת סטטוס. מסך התוצאות היה חסר עוגן לגמרי: שורה
            אפורה קטנה למעלה ואז כרטיס. עכשיו שם המקום הוא הכותרת, בשפת
            הכותרות של כל האפליקציה — מילה בזהב וקו שנמוג.
          */
          <div className="mb-5 flex items-center gap-3">
            <h2 className="shrink-0 text-[1.5rem] font-black leading-tight tracking-[-.03em]">
              סביב <span className="wood-text">{origin.label}</span>
            </h2>
            <span
              className="h-px flex-1"
              style={{
                background:
                  "linear-gradient(to left, var(--wood-border), transparent)",
              }}
            />
            <button
              type="button"
              onClick={() => {
                setOrigin(null);
                setSpots(null);
                setAdding(false);
                setNotice("");
                setError("");
              }}
              className="min-h-11 shrink-0 text-sm font-bold"
              style={{ color: "var(--wood-1)" }}
            >
              שינוי
            </button>
          </div>
        )}

        {notice && (
          <p
            className="mb-4 rounded-2xl px-4 py-3 text-sm"
            style={{ background: "var(--surface-2)", color: "var(--dim)" }}
          >
            {notice}
          </p>
        )}

        {/*
          הודעת ההרחבה. בלעדיה מתאמן ביישוב קטן מקבל רשימה של מתחים במרחק
          עשרים קילומטר בלי הסבר, וזה נראה כמו תקלה ולא כמו מציאות.
        */}
        {origin && spots && spots.length > 0 && radiusKm > 3 && (
          <p className="mb-4 text-sm" style={{ color: "var(--faint)" }}>
            לא נמצא מתח קרוב, אז הרחבנו את החיפוש לרדיוס {radiusKm} ק&quot;מ.
          </p>
        )}

        {busy && origin && (
          <p className="mb-4 text-sm" style={{ color: "var(--faint)" }}>
            טוען...
          </p>
        )}

        {/*
          כל המתחים בכרטיס אחד, שורה לשורה. חמישה כרטיסים נפרדים עם חמישה
          כפתורי ניווט ברוחב מלא נראו כמו תבנית, לא כמו רשימה.
        */}
        {spots && spots.length > 0 && (
          <div className="glass mb-3 rounded-3xl p-2">
            {spots.map((spot, i) => (
              <SpotCard
                key={spot.id}
                spot={spot}
                index={i}
                role={role}
                originLabel={origin?.precise ? "ממך" : `ממרכז ${origin?.label ?? ""}`}
                onChanged={() => origin && load(origin)}
              />
            ))}
          </div>
        )}

        {origin && spots && spots.length === 0 && !busy && (
          /*
            אותו לוח של מסך הפתיחה, כדי שהמסך הריק ייראה כמו חלק מאותה
            אפליקציה ולא כמו הודעת שגיאה. האייקון עבר מאיור בשורה לסימן
            מים שיוצא מהמסגרת, כמו בכל שאר המסכים.
          */
          <section
            className="relative mb-4 overflow-hidden rounded-[2rem] px-6 py-8"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border-1)",
              boxShadow: "var(--panel-shadow)",
            }}
          >
            <BarMark />
            <h2 className="relative text-[1.6rem] font-black leading-[1.15] tracking-[-.035em]">
              אין כאן מתח
              <br />
              <span className="wood-text">רשום עדיין</span>
            </h2>
            <p
              className="relative mt-3 max-w-[17rem] text-sm leading-6"
              style={{ color: "var(--dim)" }}
            >
              {origin.precise
                ? "מכירים מתח באזור? אפשר להוסיף אותו וכולם ירוויחו."
                : "אפשר לאתר את המיקום המדויק או לחפש יישוב אחר."}
            </p>
          </section>
        )}

        {/*
          המשפט הארוך על חישוב המרחקים ירד. כל שורת מתח כבר אומרת
          "ממרכז כפר ויתקין" ליד המרחק שלה, כלומר ההסבר חזר על מה
          שכתוב שלוש שורות מעליו. מה שנשאר הוא רק הדבר שאי אפשר לדעת
          אחרת: שהוספת מתח דורשת מיקום מדויק.
        */}
        {origin && !origin.precise && spots && (
          <p className="mb-4 text-xs" style={{ color: "var(--faint)" }}>
            להוספת מתח צריך לאתר לפי מיקום.
          </p>
        )}

        {origin?.precise &&
          (adding ? (
            <AddSpotForm
              lat={origin.lat}
              lng={origin.lng}
              onCancel={() => setAdding(false)}
              onDone={(message) => {
                setAdding(false);
                setNotice(message);
                void load(origin);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setNotice("");
                setAdding(true);
              }}
              className="min-h-14 w-full rounded-2xl font-bold"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
              }}
            >
              הוספת מתח מהמיקום הנוכחי
            </button>
          ))}

        {role === "coach" && origin && (
          <button
            type="button"
            onClick={toggleHidden}
            className="mt-4 min-h-11 w-full text-sm font-semibold"
            style={{ color: "var(--dim)" }}
          >
            {showHidden ? "הסתר מתחים מוסתרים" : "הצג גם מתחים מוסתרים"}
          </button>
        )}

        {/*
          ODbL. הנתונים המיובאים הם של OpenStreetMap, והקרדיט הוא תנאי
          לשימוש בהם ולא נימוס.
        */}
        <p className="mt-8 text-center text-xs" style={{ color: "var(--faint)" }}>
          נתוני מתקנים מ־
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            OpenStreetMap
          </a>
          , בתוספת מתחים שהקהילה של FITAY הוסיפה.
        </p>
      </div>
    </main>
  );
}

function SpotCard({
  spot,
  index,
  role,
  originLabel,
  onChanged,
}: {
  spot: Spot;
  index: number;
  role: "coach" | "trainee";
  /**
   * ממה נמדד המרחק. כשיש מיקום מדויק זה "ממך", וכשנפלנו לעיר עוגן זה
   * "ממרכז תל אביב". קודם כל שורה אמרה "ממך" גם כשזה לא היה נכון,
   * וההבהרה ישבה בהערת שוליים מתחת לעשרים שורות שגויות.
   */
  originLabel: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [moderationError, setModerationError] = useState("");

  async function act(payload: Record<string, unknown>) {
    setBusy(true);
    setModerationError("");
    try {
      const res = await fetch("/api/spots/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: spot.id, ...payload }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "לא הצלחנו לשמור את השינוי");
      }
      onChanged();
    } catch (error) {
      setModerationError(error instanceof Error ? error.message : "לא הצלחנו לשמור את השינוי");
    } finally {
      setBusy(false);
    }
  }

  /*
    הכותרת אומרת בדיוק מה שידוע.

    נקודה מיובאת היא "מתקן כושר ציבורי" ולא "מתח": ב-OSM היא מסומנת
    כמתקן כושר בלי פירוט, ומי שיילך לשם ולא ימצא מוט לא יפתח את המסך שוב.
  */
  const title =
    spot.name ||
    (spot.source === "osm" ? "מתקן כושר ציבורי" : "מתח שהוסיפו מהשטח");

  return (
    <div
      className="px-3.5 py-3"
      style={{
        borderTop: index === 0 ? "none" : "1px solid var(--line)",
        opacity: spot.hidden ? 0.5 : 1,
      }}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] font-semibold">{title}</p>
            {spot.ringsOk && (
              <span
                className="shrink-0 rounded-lg px-2.5 py-0.5 text-xs font-bold"
                style={{ background: "var(--wood-2)", color: "var(--accent-contrast)" }}
              >
                אושר לטבעות
              </span>
            )}
          </div>
          <p className="text-xs" style={{ color: "var(--dim)" }}>
            {formatDistance(spot.distanceKm)} {originLabel}
            {!spot.ringsOk && spot.ringsClaim && (
              <>
                {" · "}
                <span style={{ color: "var(--faint)" }}>דווח כמתאים</span>
              </>
            )}
          </p>
          {spot.note && (
            <p className="truncate text-xs" style={{ color: "var(--faint)" }}>
              {spot.note}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <a
            href={`https://waze.com/ul?ll=${spot.lat},${spot.lng}&navigate=yes`}
            target="_blank"
            rel="noreferrer"
            aria-label="ניווט ב-Waze"
            className="grid min-h-11 place-items-center rounded-lg px-3 text-xs font-extrabold"
            style={{
              background: "rgba(180,133,79,.12)",
              border: "1px solid rgba(180,133,79,.4)",
              color: "var(--wood-1)",
            }}
          >
            ניווט
          </a>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`}
            target="_blank"
            rel="noreferrer"
            className="grid min-h-11 place-items-center rounded-xl px-3 text-xs font-semibold"
            style={{ color: "var(--dim)" }}
          >
            מפות
          </a>
        </div>
      </div>

      {role === "coach" && (
        <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-center gap-4">
            <button
            type="button"
            disabled={busy}
            onClick={() => act({ ringsOk: !spot.ringsOk })}
            className="min-h-11 text-sm font-bold"
            style={{ color: "var(--wood-1)" }}
          >
            {spot.ringsOk ? "בטל אישור" : "אשר לטבעות"}
            </button>
            <button
            type="button"
            disabled={busy}
            onClick={() => act({ hidden: !spot.hidden })}
            className="min-h-11 text-sm font-semibold"
            style={{ color: "var(--dim)" }}
          >
            {spot.hidden ? "החזר לרשימה" : "הסתר"}
            </button>
          </div>
          {moderationError && (
            <p className="mt-1 text-xs" style={{ color: "var(--danger-text)" }}>
              {moderationError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AddSpotForm({
  lat,
  lng,
  onCancel,
  onDone,
}: {
  lat: number;
  lng: number;
  onCancel: () => void;
  onDone: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [ringsClaim, setRingsClaim] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/spots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, name, note, ringsClaim }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "משהו השתבש");
      onDone(
        data.duplicate
          ? "המתח הזה כבר רשום, אז לא הוספנו אותו פעמיים."
          : "המתח נוסף. איתי יראה אותו ויסמן אם הוא מתאים לטבעות."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
      setBusy(false);
    }
  }

  const field = {
    background: "var(--surface-1)",
    border: "1px solid var(--line)",
    color: "var(--text)",
  };

  return (
    <section className="glass rounded-3xl p-5">
      <h2 className="mb-1 font-bold">הוספת מתח</h2>
      <p className="mb-4 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
        הנקודה נלקחת מהמיקום שלך עכשיו, אז כדאי לעמוד ממש ליד המתח.
      </p>

      <label className="mb-1 block text-sm font-semibold">איך קוראים למקום</label>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={60}
        placeholder="פארק הירקון, ליד מגרש הכדורסל"
        className="mb-4 min-h-12 w-full rounded-2xl px-4"
        style={field}
      />

      <label className="mb-1 block text-sm font-semibold">משהו שכדאי לדעת</label>
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={300}
        rows={3}
        placeholder="מתח גבוה, יש צל, מלא בשעות אחר הצהריים"
        className="mb-4 w-full rounded-2xl px-4 py-3"
        style={field}
      />

      <button
        type="button"
        onClick={() => setRingsClaim(!ringsClaim)}
        className="mb-4 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-right"
        style={{ background: "var(--surface-1)", border: "1px solid var(--line)" }}
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
          style={{
            background: ringsClaim ? "var(--wood-2)" : "transparent",
            border: ringsClaim ? "none" : "1px solid var(--surface-3)",
            color: "var(--accent-contrast)",
          }}
        >
          {ringsClaim ? "✓" : ""}
        </span>
        <span className="text-sm leading-snug">
          המוט גבוה מספיק כדי לתלות עליו טבעות ולהתאמן בלי לגעת ברצפה
        </span>
      </button>

      {error && (
        <p className="mb-3 text-sm" style={{ color: "var(--danger-text)" }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="min-h-14 flex-1 rounded-2xl font-bold"
          style={{ background: "var(--wood-2)", color: "var(--accent-contrast)" }}
        >
          {busy ? "שולח..." : "הוסף"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-14 px-4 font-semibold"
          style={{ color: "var(--dim)" }}
        >
          ביטול
        </button>
      </div>
    </section>
  );
}
