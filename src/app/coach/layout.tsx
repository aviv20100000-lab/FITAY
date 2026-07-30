import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";

/** ראה ההסבר ב-client/layout: הכותרת והסרגל במעטפת כדי שלא ייעלמו במעבר. */
export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <>
      <AppHeader role="coach" />
      {children}
      <BottomNav role="coach" />
    </>
  );
}
