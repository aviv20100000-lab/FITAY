import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import PullToRefresh from "@/components/PullToRefresh";

/** לפי השעון של ישראל, בשרת — כדי שהברכה תהיה זהה בשרת ובלקוח. */
function greeting() {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Asia/Jerusalem",
    }).format(new Date())
  );
  if (h < 11) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  if (h < 21) return "ערב טוב";
  return "לילה טוב";
}

/**
 * הכותרת והסרגל יושבים כאן ולא בתוך המסכים. מעטפת לא נבנית מחדש במעבר
 * בין לשוניות, ולכן שניהם נשארים על המסך בזמן שהמסך הבא נבנה, והמעבר
 * מרגיש מיידי.
 */
export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="client-surface">
      <AppHeader role="trainee" greeting={greeting()} name={user.name} />
      <PullToRefresh>{children}</PullToRefresh>
      <BottomNav role="trainee" />
    </div>
  );
}
