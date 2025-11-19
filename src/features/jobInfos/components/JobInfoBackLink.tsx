import { BackLink } from "@/components/BackLink"
import { prisma } from "@/lib/prisma"
import { cn } from "@/lib/utils"
import { cacheTag } from "next/dist/server/use-cache/cache-tag"
import { Suspense } from "react"
import { getJobInfoIdTag } from "../dbCache"

export function JobInfoBackLink({
  jobInfoId,
  className,
}: {
  jobInfoId: string
  className?: string
}) {
  return (
    <BackLink
      href={`/app/job-infos/${jobInfoId}`}
      className={cn("mb-4", className)}
    >
      <Suspense fallback="Job Description">
        <JobName jobInfoId={jobInfoId} />
      </Suspense>
    </BackLink>
  )
}

async function JobName({ jobInfoId }: { jobInfoId: string }) {
  const jobInfo = await getJobInfo(jobInfoId)
  return jobInfo?.name ?? "Job Description"
}

async function getJobInfo(id: string) {
  "use cache"
  cacheTag(getJobInfoIdTag(id))

  try {
    return await prisma.jobInfo.findUnique({
      where: { id },
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
