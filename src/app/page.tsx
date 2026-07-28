import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

/** שער הכניסה: מנתב לפי מי שמחובר. אין דף נחיתה — נכנסים ישר לעבודה. */
export default async function Root() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(user.role === "coach" ? "/coach" : "/client");
}
