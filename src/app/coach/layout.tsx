import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import PullToRefresh from "@/components/PullToRefresh";

/** ראה ההסבר ב-client/layout: הכותרת והסרגל במעטפת כדי שלא ייעלמו במעבר. */
export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  /*
   * בדיקת התפקיד יושבת במעטפת ולא רק בדפים.
   *
   * רוב דפי המאמן בודקים בעצמם, אבל `trainees/new` הוא קומפוננטת לקוח
   * ואין בו בדיקה כזאת. מתאמן מחובר שניווט ידנית לכתובת ראה את טופס
   * פתיחת המתאמן, כולל נוסח הודעת הפתיחה. הנתונים עצמם היו מוגנים, כי
   * `POST /api/coach/trainees` אוכף תפקיד ומחזיר 403, אבל ממשק של מאמן
   * לא אמור להיפתח בכלל למי שאינו מאמן. נמצא בסקירת אבטחה ב-20 באוגוסט
   * 2026.
   *
   * כאן ולא בכל דף בנפרד: בדיקה אחת סוגרת את כל תת העץ, כולל דפים
   * שייווצרו בעתיד ויישכחו.
   */
  if (user.role !== "coach") redirect("/client");

  return (
    <div className="client-surface">
      <AppHeader role="coach" />
      <PullToRefresh>{children}</PullToRefresh>
      <BottomNav role="coach" />
    </div>
  );
}
