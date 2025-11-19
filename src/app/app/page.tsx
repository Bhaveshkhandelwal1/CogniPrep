import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { prisma } from "@/lib/prisma"
import { JobInfoForm } from "@/features/jobInfos/components/JobInfoForm"
import { getJobInfoUserTag } from "@/features/jobInfos/dbCache"
import { formatExperienceLevel } from "@/features/jobInfos/lib/formatters"
import { getCurrentUser } from "@/services/clerk/lib/getCurrentUser"
import { ArrowRightIcon, Loader2Icon, PlusIcon } from "lucide-react"
import { cacheTag } from "next/dist/server/use-cache/cache-tag"
import Link from "next/link"
import { Suspense } from "react"

export default function AppPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen-header flex items-center justify-center">
          <Loader2Icon className="size-24 animate-spin" />
        </div>
      }
    >
      <JobInfos />
    </Suspense>
  )
}

async function JobInfos() {
  const { userId, redirectToSignIn } = await getCurrentUser()
  if (userId == null) return redirectToSignIn()

  const jobInfos = await getJobInfos(userId)

  if (jobInfos.length === 0) {
    return <NoJobInfos />
  }

  return (
    <div className="container my-4">
      <div className="flex gap-2 justify-between mb-6">
        <h1 className="text-3xl md:text-4xl lg:text-5xl">
          Select a job description
        </h1>
        <Button asChild>
          <Link href="/app/job-infos/new">
            <PlusIcon />
            Create Job Description
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 has-hover:*:not-hover:opacity-70">
        {jobInfos.map(jobInfo => (
          <Link
            className="hover:scale-[1.02] transition-[transform_opacity]"
            href={`/app/job-infos/${jobInfo.id}`}
            key={jobInfo.id}
          >
            <Card className="h-full">
              <div className="flex items-center justify-between h-full">
                <div className="space-y-4 h-full">
                  <CardHeader>
                    <CardTitle className="text-lg">{jobInfo.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground line-clamp-3">
                    {jobInfo.description}
                  </CardContent>
                  <CardFooter className="flex gap-2">
                    <Badge variant="outline">
                      {formatExperienceLevel(jobInfo.experienceLevel)}
                    </Badge>
                    {jobInfo.title && (
                      <Badge variant="outline">{jobInfo.title}</Badge>
                    )}
                  </CardFooter>
                </div>
                <CardContent>
                  <ArrowRightIcon className="size-6" />
                </CardContent>
              </div>
            </Card>
          </Link>
        ))}
        <Link className="transition-opacity" href="/app/job-infos/new">
          <Card className="h-full flex items-center justify-center border-dashed border-3 bg-transparent hover:border-primary/50 transition-colors shadow-none">
            <div className="text-lg flex items-center gap-2">
              <PlusIcon className="size-6" />
              New Job Description
            </div>
          </Card>
        </Link>
      </div>
    </div>
  )
}

function NoJobInfos() {
  return (
    <div className="container my-4 max-w-5xl">
      <h1 className="text-3xl md:text-4xl lg:text-5xl mb-4">
        Welcome to CogniPrep
      </h1>
      <p className="text-muted-foreground mb-8">
        To get started, enter information about the type of job you are wanting
        to apply for. This can be specific information copied directly from a
        job listing or general information such as the tech stack you want to
        work in. The more specific you are in the description the closer the
        test interviews will be to the real thing.
      </p>
      <Card>
        <CardContent>
          <JobInfoForm />
        </CardContent>
      </Card>
    </div>
  )
}

async function getJobInfos(userId: string) {
  "use cache"
  cacheTag(getJobInfoUserTag(userId))

  // Check if database is configured
  const hasDatabase = !!process.env.DATABASE_URL
  
  if (!hasDatabase) {
    return []
  }

  try {
    // Check if prisma is properly initialized and has the jobInfo property
    if (!prisma || typeof prisma !== 'object' || !('jobInfo' in prisma)) {
      return []
    }
    
    // Check if prisma.jobInfo exists and is a function (Prisma model)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaClient = prisma as any
    if (!prismaClient.jobInfo || typeof prismaClient.jobInfo.findMany !== 'function') {
      return []
    }

    return await prismaClient.jobInfo.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    })
  } catch (error) {
    // Handle Prisma connection errors gracefully
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaError = error as any
    
    // Check for PrismaClientInitializationError (database connection issues)
    if (
      prismaError?.name === 'PrismaClientInitializationError' ||
      prismaError?.errorCode === 'P1001' ||
      prismaError?.code === 'P1001' ||
      (typeof prismaError?.message === 'string' && 
       prismaError.message.includes("Can't reach database server"))
    ) {
      // Database connection error - return empty array gracefully
      if (process.env.NODE_ENV === 'development') {
        console.warn("Database connection error (server may be unreachable):", prismaError.message)
      }
      return []
    }
    
    // If database query fails for other reasons, return empty array (graceful degradation)
    if (process.env.NODE_ENV === 'development') {
      console.error("Database query error:", error)
    }
    return []
  }
}
