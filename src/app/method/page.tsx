import { getSessionUser } from "@/lib/auth";
import { getMethodContent } from "@/lib/method-content";
import MethodExperience from "./MethodExperience";
import MethodEditor from "./MethodEditor";

export const metadata = { title: "מדריך · FITAY" };

/**
 * המדריך. אותו מסך בדיוק למאמן ולמתאמן, ולמאמן נוסף כפתור עריכה למעלה.
 *
 * העריכה יושבת כאן ולא במסך ניהול נפרד כדי שאיתי יראה את הטקסט במקום
 * שבו המתאמן יראה אותו, בלי לדמיין את התוצאה מול טופס.
 */
export default async function MethodPage() {
  const [user, content] = await Promise.all([
    getSessionUser(),
    getMethodContent(),
  ]);

  return (
    <>
      {user?.role === "coach" && <MethodEditor content={content} />}
      <MethodExperience content={content} />
    </>
  );
}
