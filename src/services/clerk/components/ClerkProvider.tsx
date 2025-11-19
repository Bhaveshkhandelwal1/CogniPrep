import { ReactNode } from "react"
import { ClerkProvider as OriginalClerkProvider } from "@clerk/nextjs"
import { buttonVariants } from "@/components/ui/button"

export function ClerkProvider({ children }: { children: ReactNode }) {
  // Get publishable key, use placeholder during build if missing
  // This allows static generation to complete even without the actual key
  const isBuildTime = process.env.NEXT_PHASE === "phase-production-build" || 
                       process.env.CI === "true" ||
                       process.env.VERCEL === "1"
  
  // Use placeholder key during build if actual key is missing
  // This allows ClerkProvider to render and SignInButton to work during static generation
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 
    (isBuildTime ? "pk_test_placeholder_for_build" : "pk_test_placeholder")

  return (
    <OriginalClerkProvider
      publishableKey={publishableKey}
      appearance={{
        cssLayerName: "vendor",
        variables: {
          colorBackground: "var(--color-background)",
          borderRadius: "var(--radius-md)",
          colorBorder: "var(--color-secondary-foreground)",
          colorDanger: "var(--color-destructive)",
          colorForeground: "var(--color-foreground)",
          colorPrimary: "var(--color-primary)",
          colorPrimaryForeground: "var(--color-primary-foreground)",
          colorInput: "var(--color-input)",
          colorInputForeground: "var(--color-text)",
          colorMuted: "var(--color-muted)",
          colorMutedForeground: "var(--color-muted-foreground)",
          colorNeutral: "var(--color-secondary-foreground)",
          colorRing: "var(--color-ring)",
          colorShadow: "var(--color-shadow-color)",
          colorSuccess: "var(--color-primary)",
          colorWarning: "var(--color-warning)",
          fontFamily: "var(--font-sans)",
          fontFamilyButtons: "var(--font-sans)",
        },
        elements: {
          pricingTableCard:
            "custom-pricing-table bg-none bg-[unset] border border-border p-6 my-3",
          pricingTableCardHeader: "p-0 pb-12",
          pricingTableCardTitle: "text-xl",
          pricingTableCardBody:
            "flex flex-col justify-end bg-none bg-[unset] *:bg-none *:bg-[unset] [&>.cl-pricingTableCardFeatures]:justify-items-end",
          pricingTableCardDescription: "text-muted-foreground text-sm mb-2",
          pricingTableCardFeeContainer: "items-baseline gap-0.5",
          pricingTableCardFee: "text-4xl",
          pricingTableCardFeePeriodNotice: "hidden",
          pricingTableCardFeePeriod: "text-base text-muted-foreground",
          pricingTableCardFeatures: "p-0 border-none",
          pricingTableCardFeaturesListItem: "[&>svg]:text-primary",
          pricingTableCardFeaturesListItemTitle: "text-sm",
          pricingTableCardFooter: "p-0 pt-8 border-none",
          pricingTableCardFooterButton: buttonVariants(),
        },
      }}
    >
      {children}
    </OriginalClerkProvider>
  )
}
