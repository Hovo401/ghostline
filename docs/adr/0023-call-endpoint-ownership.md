# 0023. One endpoint per side holds a call's media

Status: accepted

## Context

An account can be open on several devices and in several tabs at once. Calls ignored that: the server
never recorded which device answered, and `POST /calls/:id/accept`, `POST /calls/:id/token` and
`GET /calls/active` handed a LiveKit token to *any* device of a participant. Both LiveKit identities are
the `userId`, so a second device that opened the app during a call joined it on its own (the page resumed
the active call), published its microphone, played the peer's voice and made LiveKit drop the first device
as a duplicate identity. A second device that was still ringing after the first answered, or one that
tapped "Ответить" late, could take the call over the same way.

The session id (`sid`) cannot tell the devices apart: all tabs of one browser share it.

## Decision

A call has two optional endpoint ids, `Call.callerEndpointId` and `Call.calleeEndpointId`: random UUIDs a
tab / WebView generates once per page load (kept in `sessionStorage` so a reload keeps it, guarded by a Web
Lock so a duplicated tab gets a fresh one). The caller's is sent with `POST /calls`, the callee's is stored
by the `RINGING -> ACTIVE` write in `accept`.

- `accept` from the endpoint that answered is idempotent; from any other endpoint it is `409 answered_elsewhere`.
- `token` and `GET /calls/active` give media credentials only to the endpoint that owns the user's side;
  any other device of the account gets the call with `token: null` and shows it as "a call is going on
  another device" — it never joins by itself.
- Declining, cancelling and hanging up stay open to every device of the account: they end the call for
  everyone and give no media.
- `call:updated` carries both ids, so a device that is still ringing learns the call was taken and stops.

## Alternatives considered

- **Ownership by session id** — wrong granularity: two tabs of one browser would still both join.
- **Ownership by LiveKit identity per device** (`userId:endpoint`) — lets both devices join as separate
  participants, which is not what a 1:1 call is; the webhook would also end the call whenever the second
  one left.
- **Client-only guard** — the server still hands out tokens, so any old client or a second tab racing the
  first can still take over.

## Consequences

A page reload gets the same endpoint back and resumes its call; a tab that cannot get its old id becomes
"another device" for the call in progress. The columns are nullable, so calls created before the
migration have no owner: `getActive` treats them as owned by nobody and hands out no token, which only
matters for a call that is in progress during the deploy.

`endpointId` is required on `POST /calls`, `POST /calls/:id/accept` and `GET /calls/active`, so a page
loaded before the deploy gets `400` on those until it reloads (it can neither place nor answer a call).
That is accepted: the deploy ships the new bundle at the same time, and an optional field would leave
exactly the take-over hole this ADR closes open for old clients.
