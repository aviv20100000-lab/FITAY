import { redirect } from "next/navigation";

/**
 * התרגילים עברו ללשונית הספרייה, יחד עם הסרטונים.
 * הכתובת נשארת חיה בשביל קיצורי דרך ישנים במסך הבית של הטלפון.
 */
export default function ExercisesPage() {
  redirect("/coach/library");
}
