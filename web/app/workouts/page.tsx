import PageShell from "@/components/PageShell";
import WorkoutPlanner from "@/components/WorkoutPlanner";

export default function WorkoutsPage() {
  return (
    <PageShell current="/workouts">
      <WorkoutPlanner />
    </PageShell>
  );
}
