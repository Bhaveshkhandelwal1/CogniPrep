import { prisma } from "@/lib/prisma"
import { revalidateInterviewCache } from "./dbCache"
import { Prisma } from "@prisma/client"

export async function insertInterview(
  interview: Prisma.InterviewCreateInput
) {
  const newInterview = await prisma.interview.create({
    data: interview,
    select: {
      id: true,
      jobInfoId: true,
    },
  })

  revalidateInterviewCache(newInterview)

  return newInterview
}

export async function updateInterview(
  id: string,
  interview: Prisma.InterviewUpdateInput
) {
  const updatedInterview = await prisma.interview.update({
    where: { id },
    data: interview,
    select: {
      id: true,
      jobInfoId: true,
    },
  })

  revalidateInterviewCache(updatedInterview)

  return updatedInterview
}
