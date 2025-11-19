import { ExperienceLevel } from "@prisma/client"
import z from "zod"

const experienceLevels: [ExperienceLevel, ...ExperienceLevel[]] = ["junior", "mid_level", "senior"]

export const jobInfoSchema = z.object({
  name: z.string().min(1, "Required"),
  title: z.string().min(1).nullable(),
  experienceLevel: z.enum(experienceLevels),
  description: z.string().min(1, "Required"),
})
