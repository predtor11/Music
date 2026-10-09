# Recordings service

Keeps the takes you record (or import from a .mid file): the notes, the
sustain pedal, the key you picked and the chords you corrected. Port 4006,
reached through the gateway at `/api/recordings`.

| Route | What |
| --- | --- |
| `GET /takes` | Your recordings, newest first, without their notes |
| `POST /takes` | Save one (`CreateRecordingSchema`) |
| `GET /takes/:id` | One recording with its notes |
| `PATCH /takes/:id` | Rename it, set its key, or save chord corrections |
| `DELETE /takes/:id` | Delete it |

Analysis (key, chords, summary) runs in the browser with `@music/recording`,
so it is instant and works offline; this service only stores.

Data lives in the `recordings` schema when `SUPABASE_DB_URL` is set, and in
memory otherwise. Set `RECORDINGS_TEST_DB_URL` to run the Postgres tests
against a throwaway database (they drop the schema).
