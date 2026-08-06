import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import SpotsExperience from "./SpotsExperience";

export const metadata = { title: "מתחים · FITAY" };

/**
 * איפה לתלות את הטבעות.
 *
 * אותו מסך למאמן ולמתאמן, ולאיתי נוספות פעולות האישור על כל כרטיס. אותו
 * דפוס של מסך המדריך: איתי מאשר במקום שבו המתאמן רואה את התוצאה.
 *
 * המסך עצמו לא שולף כלום בשרת. הרשימה תלויה במיקום, והמיקום קיים רק
 * בדפדפן ורק אחרי שהמתאמן ביקש אותו במפורש.
 */
export default async function SpotsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return <SpotsExperience role={user.role === "coach" ? "coach" : "trainee"} />;
}
