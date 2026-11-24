import type { Profile } from "./types.js";

// Async like MealStore so a Postgres version (profiles table in CONTRACT.md) drops in later.
export interface ProfileStore {
  /** null until the first save. */
  get(): Promise<Profile | null>;
  save(profile: Profile): Promise<Profile>;
}

export class MemoryProfileStore implements ProfileStore {
  private profile: Profile | null;

  constructor(initial: Profile | null = null) {
    this.profile = initial ? { ...initial } : null;
  }

  async get(): Promise<Profile | null> {
    return this.profile ? { ...this.profile } : null;
  }

  async save(profile: Profile): Promise<Profile> {
    this.profile = { ...profile };
    return { ...this.profile };
  }
}
