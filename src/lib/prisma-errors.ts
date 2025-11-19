/**
 * Helper function to check if an error is a Prisma connection error
 * This helps handle database connection issues gracefully
 */
export function isPrismaConnectionError(error: unknown): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prismaError = error as any
  
  return (
    prismaError?.name === 'PrismaClientInitializationError' ||
    prismaError?.errorCode === 'P1001' ||
    prismaError?.code === 'P1001' ||
    (typeof prismaError?.message === 'string' && 
     prismaError.message.includes("Can't reach database server"))
  )
}

/**
 * Helper function to safely execute a Prisma query with connection error handling
 * Returns null on connection errors, throws other errors
 */
export async function safePrismaQuery<T>(
  query: () => Promise<T>,
  fallback: T | null = null
): Promise<T | null> {
  try {
    return await query()
  } catch (error) {
    if (isPrismaConnectionError(error)) {
      // Database connection error - return fallback gracefully
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prismaError = error as any
        console.warn("Database connection error (server may be unreachable):", prismaError.message)
      }
      return fallback
    }
    // Re-throw other errors
    throw error
  }
}

