# Why Arkiv

A trading competition is only credible if the ranking can be checked by someone who does not trust the host. We needed a public, queryable, expiring record with first-class filters on `trenchId`, `trader`, `rank`, `status`, without running an indexer or a subgraph in a weekend.

Arkiv gives exactly that shape: typed entities with indexed columns, a query language with `eq`/`or`/`orderBy`, owner scoping, update in place, batch writes, and expiry so the chain does not accumulate dead competitions. The leaderboard page can be rebuilt by anyone from the query in the README.

What we deliberately did **not** put on Arkiv: anything secret or replayable (World ID proofs, nullifiers, escrow keys, signed Flash orders) and anything that is private accounting (the fee ledger). Those live in Postgres; Arkiv holds the outcomes.
