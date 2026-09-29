import {
  AuthTokenResponseSchema,
  type LoginRequest,
  MeResponseSchema,
  type RegisterRequest,
  type UpdateMeRequest,
  UsernameAvailabilityResponseSchema,
} from "@ghostline/contracts";

import { apiFetch } from "./http-client";

// Routes match the backend's `AuthController`/`UsersController` (T-001, in
// progress alongside this feature) — `auth.controller.ts` under
// `@Controller("auth")`, `users.controller.ts` under `@Controller("users")`.
// `refresh` isn't in packages/contracts as a route constant (none of the
// REST paths are — only payload shapes are); it mints a fresh access token
// from the httpOnly refresh cookie per FR-AUTH-06's rotation scheme, so it
// returns the same shape as login/register.

export async function login(body: LoginRequest) {
  const data = await apiFetch("/auth/login", { method: "POST", body });
  return AuthTokenResponseSchema.parse(data);
}

export async function register(body: RegisterRequest) {
  const data = await apiFetch("/auth/register", { method: "POST", body });
  return AuthTokenResponseSchema.parse(data);
}

/** Boot-time session refresh — see `entities/session/session-bootstrap.ts`. */
export async function refreshSession() {
  const data = await apiFetch("/auth/refresh", { method: "POST" });
  return AuthTokenResponseSchema.parse(data);
}

export async function fetchMe() {
  const data = await apiFetch("/me");
  return MeResponseSchema.parse(data);
}

/** FR-USER-01/03/04/08 — settings' profile tab "Сохранить". */
export async function updateMe(body: UpdateMeRequest) {
  const data = await apiFetch("/me", { method: "PATCH", body });
  return MeResponseSchema.parse(data);
}

export async function checkUsernameAvailability(username: string) {
  const data = await apiFetch("/users/availability", { searchParams: { username } });
  return UsernameAvailabilityResponseSchema.parse(data);
}
