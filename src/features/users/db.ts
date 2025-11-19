import { prisma } from "@/lib/prisma"
import { revalidateUserCache } from "./dbCache"
import { Prisma } from "@prisma/client"

export async function upsertUser(user: Prisma.UserCreateInput) {
  await prisma.user.upsert({
    where: { id: user.id },
    create: user,
    update: user,
    })

  revalidateUserCache(user.id as string)
}

export async function deleteUser(id: string) {
  await prisma.user.delete({
    where: { id },
  })

  revalidateUserCache(id)
}
