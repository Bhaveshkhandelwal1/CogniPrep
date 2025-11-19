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

  return prisma.jobInfo.findUnique({
    where: { id },
  })
}
