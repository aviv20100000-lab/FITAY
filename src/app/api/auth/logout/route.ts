import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

export async function POST() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
