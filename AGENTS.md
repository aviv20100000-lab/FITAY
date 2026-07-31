<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Never run `exercises:sync` against the live database

The coach edits exercise content from inside the app: name, description,
technique (הדגשים), tips, tempo, muscles. It lives in the `exercises` table and
the app is the only place it is authored.

`npm run exercises:sync` upserts those same columns from
`src/lib/exercises-data.ts`. Running it against production silently overwrites
every correction the coach has made, with no error and no way back. It exists to
seed a fresh database, nothing else.

The same holds for `src/lib/method-content.ts`. Its constants are the defaults
shown until the coach publishes the guide for the first time, and they stop
being the source of truth after that. Never copy edited text back into either
file: two sources for one string is how one screen ends up showing the new
wording and another the old.

`npm run db:seed` is worse still. It rebuilds template workouts, which cascades
into `workout_items`, and `set_logs` points at those rows by id. Running it on a
live database orphans real training history.
