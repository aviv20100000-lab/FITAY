import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";

/**
 * "מדריך" היא לשונית של שני התפקידים, ולכן היא יושבת מחוץ ל-client
 * ול-coach וצריכה מעטפת משל עצמה. הסרגל היה קודם בתוך הדף, ולכן הוא נעלם
 * בכל מעבר לכאן וחזר. עכשיו הוא נשאר.
 */
export default async function MethodLayout({
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
