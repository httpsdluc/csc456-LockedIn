import Dashboard from "@/components/Dashboard";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-12">

        {/* Header */}
        <header className="mb-10">
          <h1 className="text-4xl font-bold text-green-400">
            LockedIn
          </h1>

          <p className="mt-3 text-gray-300">
            Your AI-powered health and fitness tracker
          </p>
        </header>

        {/* Welcome Section */}
        <section className="mb-8 rounded-xl border border-gray-700 bg-gray-900 p-6">
          <h2 className="text-2xl font-semibold">
            Welcome to LockedIn
          </h2>

          <p className="mt-3 text-gray-300">
            Track your meals, monitor your daily calories,
            and stay consistent with your fitness goals.
          </p>
        </section>

        {/* Summary, meal form and meal list */}
        <Dashboard />

      </div>
    </main>
  );
}
