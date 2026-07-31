import { redirect } from "next/navigation";

/**
 * הסרטונים עברו ללשונית הספרייה, יחד עם התרגילים.
 * הכתובת נשארת חיה בשביל קיצורי דרך ישנים במסך הבית של הטלפון.
 * רכיב VideoLibrary עצמו נשאר כאן, והספרייה מייבאת אותו.
 */
export default function VideosPage() {
  redirect("/coach/library");
}
