import BottomNav from "@/components/BottomNav";

export default function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <BottomNav role="coach" />
    </>
  );
}
