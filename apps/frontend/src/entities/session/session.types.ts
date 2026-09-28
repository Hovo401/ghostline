// The wire shapes already live in @ghostline/contracts — re-exported here
// so features import the "current user" domain type from entities/session
// like any other entity, without reaching past it into shared/api.
export type { UserPublicProfile } from "@ghostline/contracts";
