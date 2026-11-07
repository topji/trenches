# Reach

Who touches the Arkiv records and how:

- **Judges and anyone with the link.** Every Trench page shows "Public record on Arkiv" with the entity link; every settled Trench shows the payout entities. The README carries a runnable query that returns the live boards.
- **Entrants.** The leaderboard they watch is served from the `lb` query; their profile page is the `profile` entity plus their `lb` rows across Trenches.
- **Hosts and sponsors.** The sponsorship entity is the public receipt for the pool contribution.
- **Trenches (the groups).** The monthly ladder is the `clan_score` query; Trench pages read `clan` and `clan_member` (identifiers kept, UI says Trench).
- **Demo.** The Flash gate Trench was traded from a real wallet on Base and settled on Hedera; its Trench, `lb`, entry and payout entities on Rabdi are the ones linked from the README.

Growth path: Trenches is meant to become a tab inside the Zolt app, where every community competition would write its ranking to Arkiv in the same schema, so a trader's history is portable across hosts.
