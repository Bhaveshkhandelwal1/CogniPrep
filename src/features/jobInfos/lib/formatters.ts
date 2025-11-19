import { ExperienceLevel } from "@prisma/client"

export function formatExperienceLevel(level: ExperienceLevel) {
  switch (level) {
    case "junior":
      return "Junior"
    case "mid_level":
      return "Mid-Level"
    case "senior":
      return "Senior"
    default:
      throw new Error(`Unknown experience level: ${level satisfies never}`)
  }
}
