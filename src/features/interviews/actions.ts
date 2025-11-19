"use server"

import { getCurrentUser } from "@/services/clerk/lib/getCurrentUser"
import { cacheTag } from "next/dist/server/use-cache/cache-tag"
import { getJobInfoIdTag } from "../jobInfos/dbCache"
import { prisma } from "@/lib/prisma"
import { insertInterview, updateInterview as updateInterviewDb } from "./db"
import { getInterviewIdTag } from "./dbCache"
import { canCreateInterview } from "./permissions"
import { PLAN_LIMIT_MESSAGE, RATE_LIMIT_MESSAGE } from "@/lib/errorToast"
import { env } from "@/data/env/server"
import arcjet, { tokenBucket, request } from "@arcjet/next"
import { generateAiInterviewFeedback } from "@/services/ai/interviews"

// Only initialize Arcjet if key is available
const aj = env.ARCJET_KEY ? arcjet({
  characteristics: ["userId"],
  key: env.ARCJET_KEY,
  rules: [
    tokenBucket({
      capacity: 12,
      refillRate: 4,
      interval: "1d",
      mode: process.env.NODE_ENV === "production" ? "LIVE" : "DRY_RUN",
    }),
  ],
}) : null

export async function createInterview({
  jobInfoId,
}: {
  jobInfoId: string
}): Promise<{ error: true; message: string } | { error: false; id: string }> {
  const { userId } = await getCurrentUser()
  if (userId == null) {
    return {
      error: true,
      message: "You don't have permission to do this",
    }
  }

  if (!(await canCreateInterview())) {
    return {
      error: true,
      message: PLAN_LIMIT_MESSAGE,
    }
  }

  // Only check rate limit if Arcjet is configured
  if (aj) {
    const decision = await aj.protect(await request(), {
      userId,
      requested: 1,
    })

    if (decision.isDenied()) {
      return {
        error: true,
        message: RATE_LIMIT_MESSAGE,
      }
    }
  }

  const jobInfo = await getJobInfo(jobInfoId, userId)
  if (jobInfo == null) {
    return {
      error: true,
      message: "You don't have permission to do this",
    }
  }

  const interview = await insertInterview({
    jobInfo: { connect: { id: jobInfoId } },
    duration: "00:00:00",
  })

  return { error: false, id: interview.id }
}

export async function updateInterview(
  id: string,
  data: {
    duration?: string
    messages?: string
  }
) {
  const { userId } = await getCurrentUser()
  if (userId == null) {
    return {
      error: true,
      message: "You don't have permission to do this",
    }
  }

  const interview = await getInterview(id, userId)
  if (interview == null) {
    return {
      error: true,
      message: "You don't have permission to do this",
    }
  }

  await updateInterviewDb(id, data)

  return { error: false }
}

export async function generateInterviewFeedback(interviewId: string) {
  const { userId, user } = await getCurrentUser({ allData: true })
  if (userId == null || user == null) {
    return {
      error: true,
      message: "You don't have permission to do this",
    }
  }

  const interview = await getInterview(interviewId, userId)
  if (interview == null) {
    return {
      error: true,
      message: "You don't have permission to do this",
    }
  }

  if (interview.messages == null) {
    return {
      error: true,
      message: "Interview has not been completed yet",
    }
  }

  let feedback: string
  try {
    feedback = await generateAiInterviewFeedback({
      messages: interview.messages,
      jobInfo: interview.jobInfo,
      userName: user.name,
    })
  } catch (error) {
    console.error("Failed to generate AI interview feedback:", error)
    const message =
      error instanceof Error && /overloaded/i.test(error.message)
        ? "The AI model is temporarily overloaded. Please try generating feedback again in a moment."
        : "Failed to generate AI feedback. Please try again."
    return {
      error: true,
      message,
    }
  }

  if (feedback == null) {
    return {
      error: true,
      message: "Failed to generate feedback",
    }
  }

  await updateInterviewDb(interviewId, { feedback })

  return { error: false }
}

async function getJobInfo(id: string, userId: string) {
  "use cache"
  cacheTag(getJobInfoIdTag(id))

  return prisma.jobInfo.findFirst({
    where: {
      id,
      userId,
    },
  })
}

async function getInterview(id: string, userId: string) {
  "use cache"
  cacheTag(getInterviewIdTag(id))

  const interview = await prisma.interview.findUnique({
    where: { id },
    include: {
      jobInfo: {
        select: {
          id: true,
          userId: true,
          description: true,
          title: true,
          experienceLevel: true,
        },
      },
    },
  })

  if (interview == null) return null

  cacheTag(getJobInfoIdTag(interview.jobInfo.id))
  if (interview.jobInfo.userId !== userId) return null

  return interview
}
