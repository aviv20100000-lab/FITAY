import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";

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
      <AppHeader role="trainee" />
      {children}
      <BottomNav role="trainee" />
    </div>
  );
}
