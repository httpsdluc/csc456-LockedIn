import Dashboard from "@/components/Dashboard";
import PageShell from "@/components/PageShell";

export default function Home() {
  return (
    <PageShell current="/">
      {/* Summary, meal form and meal list */}
      <Dashboard />
    </PageShell>
  );
}