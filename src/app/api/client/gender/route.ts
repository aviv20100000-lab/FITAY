import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import db, { initDb } from "@/lib/db";
import type { Gender } from "@/lib/gender";

function parseGender(value: unknown): { valid: boolean; gender: Gender } {
  if (value == null || value === "" || value === "unspecified") {
    return { valid: true, gender: null };
  }
  if (value === "male" || value === "female") {
    return { valid: true, gender: value };
  }
  return { valid: false, gender: null };
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "trainee") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  const rawGender = contentType.includes("application/json")
    ? (await request.json().catch(() => null))?.gender
    : (await request.formData().catch(() => null))?.get("gender");
  const parsed = parseGender(rawGender);
  if (!parsed.valid) {
    return NextResponse.json({ error: "בחירת המגדר לא תקינה" }, { status: 400 });
  }

  await initDb();
  await db.execute({
    sql: "UPDATE users SET gender = ? WHERE id = ? AND role = 'trainee'",
    args: [parsed.gender, user.id],
  });

  if (contentType.includes("application/json")) {
    return NextResponse.json({ ok: true, gender: parsed.gender });
  }
  return NextResponse.redirect(new URL("/client/settings", request.url), 303);
}
