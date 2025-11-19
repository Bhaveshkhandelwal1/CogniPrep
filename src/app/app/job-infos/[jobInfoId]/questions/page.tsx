import { prisma } from "@/lib/prisma"
import { getJobInfoIdTag } from "@/features/jobInfos/dbCache"
import { canCreateQuestion } from "@/features/questions/permissions"
import { getCurrentUser } from "@/services/clerk/lib/getCurrentUser"
import { Loader2Icon } from "lucide-react"
import { cacheTag } from "next/dist/server/use-cache/cache-tag"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { NewQuestionClientPage } from "./_NewQuestionClientPage"

export default async function QuestionsPage({
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
  const { userId, redirectToSignIn } = await getCurrentUser()
  if (userId == null) return redirectToSignIn()

  if (!(await canCreateQuestion())) return redirect("/app/upgrade")

  const jobInfo = await getJobInfo(jobInfoId, userId)
  if (jobInfo == null) return notFound()

  return <NewQuestionClientPage jobInfo={jobInfo} />
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
