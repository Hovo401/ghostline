# 0021. Accept the previous refresh token once

Status: accepted

## Context

`/auth/refresh` rotates the refresh token, and presenting a token that was already rotated away revokes
the whole family (FR-AUTH-06, reuse detection). In the Android shell this logged people out for no
reason: the WebView's `CookieManager` writes cookies to disk with a delay, so a refresh followed by a
swipe-away, a killed process or an APK update left the *old* cookie on disk. The next launch presented
it and the server treated the user as a thief. A refresh response lost on a flaky network does the same.

## Decision

`Session.previousTokenHash` holds the hash the last rotation replaced. `refresh` accepts the current
token **or** the previous one. Presenting the current token moves it into `previousTokenHash`, so the
previous token stops working as soon as the current one has been used once; retrying with the previous
token keeps it as the fallback. Anything older, or any token on a revoked session, still revokes the
family and deletes its native push devices.

The Android shell also calls `CookieManager.flush()` when the activity pauses, so the rotated cookie is
on disk before the process can be killed (the root cause); this ADR covers installed APKs and lost
responses.

## Alternatives considered

- **Time-based grace window for any rotated token** — wider than needed, and a stolen token stays
  usable for the whole window.
- **Stop rotating the refresh token** — drops reuse detection altogether.
- **Compare-and-swap on rotation** — would also close the race of two parallel refreshes with the same
  token; not done here, the client serialises refreshes instead (single in-flight promise plus a Web
  Lock).

## Consequences

A thief who replays the *previous* token before the legitimate client has used the current one gets one
extra rotation; the next use by either side of a token that no longer matches revokes the family, as
before. Sessions are no longer killed by a cookie that did not reach the disk.
