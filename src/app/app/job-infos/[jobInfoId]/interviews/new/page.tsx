import { prisma } from "@/lib/prisma"
import { getJobInfoIdTag } from "@/features/jobInfos/dbCache"
import { getCurrentUser } from "@/services/clerk/lib/getCurrentUser"
import { Loader2Icon } from "lucide-react"
import { cacheTag } from "next/dist/server/use-cache/cache-tag"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { FreeVoiceInterview } from "./_FreeVoiceInterview"
import { canCreateInterview } from "@/features/interviews/permissions"

export default async function NewInterviewPage({
  params,
}: {
  params: Promise<{ jobInfoId: string }>
}) {
  const { jobInfoId } = await params
  return (
    <Suspense
      fallback={
        <div className="h-screen-header flex items-center justify-center">
          <Loader2Icon className="animate-spin size-24" />
        </div>
      }
    >
      <SuspendedComponent jobInfoId={jobInfoId} />
    </Suspense>
  )
}

async function SuspendedComponent({ jobInfoId }: { jobInfoId: string }) {
  const { userId, redirectToSignIn, user } = await getCurrentUser({
    allData: true,
  })
  if (userId == null || user == null) return redirectToSignIn()

  if (!(await canCreateInterview())) return redirect("/app/upgrade")

  const jobInfo = await getJobInfo(jobInfoId, userId)
  if (jobInfo == null) return notFound()

  return (
    <FreeVoiceInterview
      jobInfo={jobInfo}
      user={user}
    />
  )
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
