import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";

/**
 * "מתחים" היא לשונית של שני התפקידים, בדיוק כמו "מדריך", ולכן היא יושבת
 * מחוץ ל-client ול-coach וצריכה מעטפת משל עצמה. בלי זה הסרגל היה נעלם
 * וחוזר בכל כניסה למסך.
 */
export default async function SpotsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const role = user.role === "coach" ? "coach" : "trainee";

  const content = (
    <>
      <AppHeader role={role} />
      {children}
      <BottomNav role={role} />
    </>
  );

  return role === "trainee" ? (
    <div className="client-surface">{content}</div>
  ) : (
    content
  );
}
