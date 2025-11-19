"use server"

import { prisma } from "@/lib/prisma"

export async function getUser(id: string) {
  // Don't use cache to ensure fresh data during onboarding
  // This prevents stale cache issues when user is created
  return prisma.user.findUnique({
    where: { id },
  })
}
