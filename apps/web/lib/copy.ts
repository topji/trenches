/** All UI strings live here (COPY.md). Sentence case, plain verbs, no exclamation marks. */
export const copy = {
  app: {
    name: "Trenches",
    site: "jointrenches.xyz",
    handle: "@jointrenches",
    tagline: "Trading competitions your community can’t fake. Join the trenches.",
    sub: "Host a Trench, trade from your own wallet, and let the leaderboard settle it. Prizes pay out on their own.",
    footer:
      "Built at ETHGlobal Mumbai · Open source · Execution by Definitive Flash · Records on Arkiv · Escrow on Hedera · Humans by World ID",
  },
  nav: { trenches: "Trenches", create: "Create", dashboard: "Dashboard", connect: "Connect wallet", signIn: "Sign in" },
  cta: {
    create: "Create a Trench",
    fund: "Fund escrow",
    join: "Join this Trench",
    place: "Place order",
    share: "Share Trench",
    browse: "Browse Trenches",
  },
  landing: {
    liveHeading: "Live Trenches",
    liveEmpty: "No live Trenches yet. Create one for your group.",
    howHeading: "How a Trench works",
    how: [
      { title: "Host a Trench", body: "Pick the assets, the window, and the prize pool. The pool is escrowed on Hedera." },
      { title: "Entrants join as humans", body: "One World ID check, one slot per person. No alt accounts on the board." },
      { title: "Trade from your own wallet", body: "Orders go through Definitive Flash. Nothing is custodied." },
      { title: "The board settles it", body: "Fills rank the board on Arkiv. At the deadline the pool pays the winners." },
    ],
  },
  status: { upcoming: "Upcoming", live: "Live", endingSoon: "Ending soon", ended: "Ended", settled: "Settled" },
  badge: { human: "Verified unique human (World ID)" },
  system: {
    networkError: (service: string, n: number) => `Couldn't reach ${service}. Retrying in ${n}s.`,
    notFound: "This Trench doesn't exist or the link is wrong.",
    pageNotFound: "This page doesn't exist.",
  },
} as const;
