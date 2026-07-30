import { NextResponse } from "next/server";
import { login, setSession } from "@/lib/auth";

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

export async function POST(request: Request) {
  let phone: string, password: string;
  try {
    const body = await request.json();
    phone = String(body.phone ?? "");
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  if (!phone.trim() || !password) {
    return NextResponse.json({ error: "צריך טלפון וסיסמה" }, { status: 400 });
  }

  const user = await login(phone, password);
  if (!user) {
    // אותה הודעה לטלפון לא קיים ולסיסמה שגויה — אחרת אפשר לגלות מי רשום.
    return NextResponse.json({ error: "טלפון או סיסמה שגויים" }, { status: 401 });
  }

  await setSession(user);
  return NextResponse.json({ role: user.role, name: user.name });
}
