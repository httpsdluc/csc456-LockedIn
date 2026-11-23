import PageShell from "@/components/PageShell";
import ProfileForm from "@/components/ProfileForm";

export default function ProfilePage() {
  return (
    <PageShell current="/profile">
      <section
        aria-labelledby="profile-heading"
        className="mx-auto max-w-2xl rounded-[28px] bg-[#1B1A36] p-6 ring-1 ring-[#2E2B57] sm:p-8"
      >
        <h2
          id="profile-heading"
          className="text-xl font-semibold [font-family:var(--font-display)]"
        >
          Your Profile
        </h2>
        <p className="mt-2 mb-6 text-sm text-[#A9A7C9]">
          Your goal and daily calories set the targets on your dashboard. Your
          workout plans will use your goal, fitness level and training days.
        </p>
        <ProfileForm />
      </section>
    </PageShell>
  );
}