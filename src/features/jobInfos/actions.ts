"use server"

import z from "zod"
import { jobInfoSchema } from "./schemas"
import { getCurrentUser } from "@/services/clerk/lib/getCurrentUser"
import { insertJobInfo, updateJobInfo as updateJobInfoDb } from "./db"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { cacheTag } from "next/dist/server/use-cache/cache-tag"
import { getJobInfoIdTag } from "./dbCache"

export async function createJobInfo(unsafeData: z.infer<typeof jobInfoSchema>) {
  const { userId } = await getCurrentUser()
  if (userId == null) {
    return {
      error: true,
      message: "You don't have permission to do this",
    }
  }

  const { success, data } = jobInfoSchema.safeParse(unsafeData)
  if (!success) {
    return {
      error: true,
      message: "Invalid job data",
    }
  }

  const jobInfo = await insertJobInfo({ ...data, user: { connect: { id: userId } } })

  redirect(`/app/job-infos/${jobInfo.id}`)
}

export async function updateJobInfo(
  id: string,
  unsafeData: z.infer<typeof jobInfoSchema>
) {
  const { userId } = await getCurrentUser()
  if (userId == null) {
    return {
      error: true,
      message: "You don't have permission to do this",
    }
  }

  const { success, data } = jobInfoSchema.safeParse(unsafeData)
  if (!success) {
    return {
      error: true,
      message: "Invalid job data",
    }
  }

  const existingJobInfo = await getJobInfo(id, userId)
  if (existingJobInfo == null) {
    return {
      error: true,
      message: "You don't have permission to do this",
    }
  }

  const jobInfo = await updateJobInfoDb(id, data)

  redirect(`/app/job-infos/${jobInfo.id}`)
}

async function getJobInfo(id: string, userId: string) {
  "use cache"
  cacheTag(getJobInfoIdTag(id))

  try {
    return await prisma.jobInfo.findFirst({
      where: {
        id,
        userId,
      },
    })
  } catch (error) {
    // Handle Prisma connection errors gracefully
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaError = error as any
    
    if (
      prismaError?.name === 'PrismaClientInitializationError' ||
      prismaError?.errorCode === 'P1001' ||
      prismaError?.code === 'P1001' ||
      (typeof prismaError?.message === 'string' && 
       prismaError.message.includes("Can't reach database server"))
    ) {
      if (process.env.NODE_ENV === 'development') {
        console.warn("Database connection error (server may be unreachable):", prismaError.message)
      }
      return null
    }
    
    throw error
  }
}
