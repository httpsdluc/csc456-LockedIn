import { dailySummary, meals } from "@/lib/fixtures";

export default function Home() {
  const progress =
    dailySummary.goalCalories > 0
      ? Math.min(
          (dailySummary.calories / dailySummary.goalCalories) * 100,
          100
        )
      : 0;

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

        {/* Daily Summary */}
        <section className="mb-8 rounded-xl border border-gray-700 bg-gray-900 p-6">
          <h2 className="mb-6 text-2xl font-semibold">
            Daily Nutrition Summary
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-gray-800 p-5">
              <p className="text-sm text-gray-400">Calories Consumed</p>
              <p className="mt-2 text-3xl font-bold text-green-400">
                {dailySummary.calories}
              </p>
            </div>

            <div className="rounded-lg bg-gray-800 p-5">
              <p className="text-sm text-gray-400">Daily Goal</p>
              <p className="mt-2 text-3xl font-bold">
                {dailySummary.goalCalories}
              </p>
            </div>

            <div className="rounded-lg bg-gray-800 p-5">
              <p className="text-sm text-gray-400">Remaining Calories</p>
              <p className="mt-2 text-3xl font-bold text-green-400">
                {dailySummary.remainingCalories}
              </p>
            </div>
          </div>

          {/* Calorie Progress */}
          <div className="mt-6">
            <div className="mb-2 flex justify-between text-sm">
              <span>Daily Progress</span>
              <span>{progress.toFixed(0)}%</span>
            </div>

            <div className="h-3 rounded-full bg-gray-700">
              <div
                className="h-3 rounded-full bg-green-400"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Macronutrients */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-gray-400">Protein</p>
              <p className="text-xl font-semibold">
                {dailySummary.proteinG} g
              </p>
            </div>

            <div>
              <p className="text-gray-400">Carbs</p>
              <p className="text-xl font-semibold">
                {dailySummary.carbsG} g
              </p>
            </div>

            <div>
              <p className="text-gray-400">Fat</p>
              <p className="text-xl font-semibold">
                {dailySummary.fatG} g
              </p>
            </div>
          </div>
        </section>

        {/* Sample Meals */}
        <section className="rounded-xl border border-gray-700 bg-gray-900 p-6">
          <h2 className="mb-5 text-2xl font-semibold">
            Today's Meals
          </h2>

          <div className="space-y-3">
            {meals.map((meal) => (
              <div
                key={meal.id}
                className="flex items-center justify-between rounded-lg bg-gray-800 p-4"
              >
                <div>
                  <h3 className="font-semibold">{meal.name}</h3>
                  <p className="text-sm capitalize text-gray-400">
                    {meal.mealType}
                  </p>
                </div>

                <p className="font-semibold text-green-400">
                  {meal.calories} kcal
                </p>
              </div>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
}