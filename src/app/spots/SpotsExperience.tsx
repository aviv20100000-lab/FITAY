"use client";

import { useCallback, useState } from "react";
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
const CITIES: { name: string; lat: number; lng: number }[] = [
  { name: "תל אביב", lat: 32.0853, lng: 34.7818 },
  { name: "ירושלים", lat: 31.7683, lng: 35.2137 },
  { name: "חיפה", lat: 32.794, lng: 34.9896 },
  { name: "באר שבע", lat: 31.253, lng: 34.7915 },
  { name: "ראשון לציון", lat: 31.973, lng: 34.7925 },
  { name: "פתח תקווה", lat: 32.084, lng: 34.8878 },
  { name: "נתניה", lat: 32.3215, lng: 34.8532 },
  { name: "אשדוד", lat: 31.8014, lng: 34.6435 },
  { name: "רמת גן", lat: 32.0684, lng: 34.8248 },
  { name: "חולון", lat: 32.0117, lng: 34.7725 },
  { name: "רחובות", lat: 31.8928, lng: 34.8113 },
  { name: "כפר סבא", lat: 32.175, lng: 34.907 },
  { name: "מודיעין", lat: 31.8928, lng: 35.0104 },
  { name: "אשקלון", lat: 31.6688, lng: 34.5743 },
  { name: "טבריה", lat: 32.7922, lng: 35.5312 },
  { name: "אילת", lat: 29.5577, lng: 34.9519 },
];

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
            : "לא הצלחנו לאתר אותך. נסה שוב, או בחר עיר מהרשימה."
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
        <p className="mb-6 text-sm" style={{ color: "var(--dim)" }}>
          מוט אופקי ציבורי לתלות עליו את הטבעות, לפי הקרוב אליך.
        </p>

        {!origin && !pickingCity && (
          <section className="glass mb-4 rounded-3xl p-5">
            <h2 className="mb-2 font-bold">איפה אתה עכשיו</h2>
            <p className="mb-4 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
              נשתמש במיקום שלך רק כדי לסדר את הרשימה לפי מרחק. הוא לא נשמר
              ולא מגיע לאף אחד.
            </p>
            <button
              type="button"
              onClick={locate}
              disabled={busy}
              className="min-h-14 w-full rounded-2xl font-bold"
              style={{ background: "var(--wood-2)", color: "var(--accent-contrast)" }}
            >
              {busy ? "מאתר..." : "מצא מתח לידי"}
            </button>
            <button
              type="button"
              onClick={() => setPickingCity(true)}
              className="mt-3 min-h-11 w-full text-sm font-semibold"
              style={{ color: "var(--dim)" }}
            >
              או בחר עיר מהרשימה
            </button>
          </section>
        )}

        {error && (
          <p
            className="mb-4 rounded-2xl px-4 py-3 text-sm leading-relaxed"
            style={{ background: "var(--soft-2)", color: "var(--danger-text)" }}
          >
            {error}
          </p>
        )}

        {pickingCity && (
          <section className="glass mb-4 rounded-3xl p-5">
            <h2 className="mb-3 font-bold">בחירת עיר</h2>
            <div className="flex flex-wrap gap-2">
              {CITIES.map((city) => (
                <button
                  key={city.name}
                  type="button"
                  onClick={() => {
                    setPickingCity(false);
                    void load({
                      lat: city.lat,
                      lng: city.lng,
                      label: city.name,
                      precise: false,
                    });
                  }}
                  className="min-h-11 rounded-xl px-4 text-sm font-semibold"
                  style={{
                    background: "var(--soft-2)",
                    border: "1px solid var(--line)",
                  }}
                >
                  {city.name}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={locate}
              className="mt-4 min-h-11 text-sm font-semibold"
              style={{ color: "var(--wood-1)" }}
            >
              נסה שוב לאתר אותי
            </button>
          </section>
        )}

        {origin && (
          <div className="mb-4 flex items-center justify-between gap-3 text-sm">
            <span style={{ color: "var(--dim)" }}>
              מחפש סביב <span className="font-semibold">{origin.label}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setOrigin(null);
                setSpots(null);
                setAdding(false);
                setNotice("");
                setError("");
              }}
              className="min-h-11 font-semibold"
              style={{ color: "var(--wood-1)" }}
            >
              שינוי
            </button>
          </div>
        )}

        {notice && (
          <p
            className="mb-4 rounded-2xl px-4 py-3 text-sm"
            style={{ background: "var(--soft-2)", color: "var(--dim)" }}
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
                onChanged={() => origin && load(origin)}
              />
            ))}
          </div>
        )}

        {origin && spots && spots.length === 0 && !busy && (
          <section className="glass mb-4 rounded-3xl p-5">
            <h2 className="mb-2 font-bold">אין כאן מתח רשום עדיין</h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
              {origin.precise
                ? "אם אתה מכיר מתח באזור, הוסף אותו וכולם ירוויחו."
                : "נסה לאתר את המיקום המדויק שלך, או בחר עיר אחרת."}
            </p>
          </section>
        )}

        {origin && !origin.precise && spots && (
          <p className="mb-4 text-sm leading-relaxed" style={{ color: "var(--faint)" }}>
            המרחקים מחושבים ממרכז {origin.label}. כדי להוסיף מתח צריך מיקום
            מדויק.
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
                background: "var(--soft-2)",
                border: "1px solid var(--line)",
              }}
            >
              הוסף מתח שאתה עומד לידו
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
  onChanged,
}: {
  spot: Spot;
  index: number;
  role: "coach" | "trainee";
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function act(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch("/api/spots/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: spot.id, ...payload }),
      });
      onChanged();
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
            {formatDistance(spot.distanceKm)} ממך
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
            aria-label="נווט ב-Waze"
            className="grid min-h-11 place-items-center rounded-xl px-3 text-xs font-extrabold"
            style={{
              background: "var(--soft-2)",
              border: "1px solid var(--line)",
              color: "var(--wood-1)",
            }}
          >
            נווט
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
        <div className="mt-2 flex items-center gap-4 border-t pt-2" style={{ borderColor: "var(--line)" }}>
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
    background: "var(--soft-1)",
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
        style={{ background: "var(--soft-1)", border: "1px solid var(--line)" }}
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
          style={{
            background: ringsClaim ? "var(--wood-2)" : "transparent",
            border: ringsClaim ? "none" : "1px solid var(--soft-4)",
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
