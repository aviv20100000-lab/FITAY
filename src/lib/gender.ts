export type Gender = "male" | "female" | null;

export function byGender(
  gender: Gender,
  neutral: string,
  male: string,
  female: string
): string {
  if (gender === "male") return male;
  if (gender === "female") return female;
  return neutral;
}
