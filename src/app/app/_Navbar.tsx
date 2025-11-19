"use client"

import {
  BookOpenIcon,
  BrainCircuitIcon,
  FileSlidersIcon,
  LogOut,
  SpeechIcon,
  User,
} from "lucide-react"
import { ThemeToggle } from "@/components/ThemeToggle"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import dynamic from "next/dynamic"
import Link from "next/link"
import { UserAvatar } from "@/features/users/components/UserAvatar"
import { useParams, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"

const navLinks = [
  { name: "Interviews", href: "interviews", Icon: SpeechIcon },
  { name: "Questions", href: "questions", Icon: BookOpenIcon },
  { name: "Resume", href: "resume", Icon: FileSlidersIcon },
]

// Check if Clerk is configured
const hasClerk = typeof window !== 'undefined' && 
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY !== "pk_test_placeholder_for_build"

// Dynamically import Clerk components only if Clerk is available
const ClerkNavbarActions = hasClerk
  ? dynamic(
      () => import("@clerk/nextjs").then((mod) => {
        const { SignOutButton, useClerk } = mod
        return function ClerkNavbarActionsInner() {
          const { openUserProfile } = useClerk()
          return (
            <>
              <DropdownMenuItem onClick={() => openUserProfile()}>
                <User className="mr-2 size-4" />
                Profile
              </DropdownMenuItem>
              <SignOutButton>
                <DropdownMenuItem>
                  <LogOut className="mr-2 size-4" />
                  Logout
                </DropdownMenuItem>
              </SignOutButton>
            </>
          )
        }
      }),
      {
        ssr: false,
        loading: () => (
          <DropdownMenuItem disabled>
            <LogOut className="mr-2 size-4" />
            Logout
          </DropdownMenuItem>
        ),
      }
    )
  : null

export function Navbar({ user }: { user: { name: string; imageUrl: string } }) {
  const { jobInfoId } = useParams()
  const pathName = usePathname()

  return (
    <nav className="h-header border-b bg-background/95 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
      <div className="container flex h-full items-center justify-between">
        <Link 
          href="/" 
          className="flex items-center gap-2.5 group transition-transform hover:scale-105"
        >
          <div className="relative">
            <BrainCircuitIcon className="size-8 text-primary transition-all group-hover:rotate-12" />
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            CogniPrep
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {typeof jobInfoId === "string" &&
            navLinks.map(({ name, href, Icon }) => {
              const hrefPath = `/app/job-infos/${jobInfoId}/${href}`
              const isActive = pathName === hrefPath

              return (
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  key={name}
                  asChild
                  className={`cursor-pointer max-sm:hidden transition-all ${
                    isActive 
                      ? "shadow-lg" 
                      : "hover:bg-accent/50"
                  }`}
                >
                  <Link href={hrefPath} className="flex items-center gap-2">
                    <Icon className="size-4" />
                    <span>{name}</span>
                  </Link>
                </Button>
              )
            })}

          <div className="ml-2 pl-2 border-l">
            <ThemeToggle />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger className="ml-2 rounded-full hover:ring-2 ring-primary/50 transition-all">
              <UserAvatar user={user} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {hasClerk && ClerkNavbarActions ? (
                <ClerkNavbarActions />
              ) : (
                <DropdownMenuItem asChild>
                  <Link href="/sign-in">
                    <LogOut className="mr-2 size-4" />
                    Logout
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  )
}
