import { prisma } from "@/lib/prisma"
import { revalidateQuestionCache } from "./dbCache"
import { Prisma } from "@prisma/client"

export async function insertQuestion(
  question: Prisma.QuestionCreateInput
) {
  const newQuestion = await prisma.question.create({
    data: question,
    select: {
      id: true,
      jobInfoId: true,
    },
  })

  revalidateQuestionCache({
    id: newQuestion.id,
    jobInfoId: newQuestion.jobInfoId,
  })

  return newQuestion
}
