import BottomNav from "@/components/BottomNav";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <BottomNav role="trainee" />
    </>
  );
}
