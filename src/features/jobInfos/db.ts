import { prisma } from "@/lib/prisma"
import { revalidateJobInfoCache } from "./dbCache"
import { Prisma } from "@prisma/client"

export async function insertJobInfo(jobInfo: Prisma.JobInfoCreateInput) {
  const newJobInfo = await prisma.jobInfo.create({
    data: jobInfo,
    select: {
      id: true,
      userId: true,
    },
  })

  revalidateJobInfoCache(newJobInfo)

  return newJobInfo
}

export async function updateJobInfo(
  id: string,
  jobInfo: Prisma.JobInfoUpdateInput
) {
  const updatedJobInfo = await prisma.jobInfo.update({
    where: { id },
    data: jobInfo,
    select: {
      id: true,
      userId: true,
    },
    })

  revalidateJobInfoCache(updatedJobInfo)

  return updatedJobInfo
}
