// Named re-exports only — no `export * from` here. `tsc` compiles a wildcard
// re-export to a runtime `__exportStar` helper under CommonJS, which
// Rollup's production build (apps/frontend's `vite build`) cannot statically
// resolve into named exports (it only recognizes direct
// `Object.defineProperty(exports, "Name", ...)` bindings, which is what an
// explicit `export { Name } from "..."` compiles to). Add new exports here by
// name, in both the value and the `export type` list for that module.

export { HealthCheckStatusSchema, HealthResponseSchema } from "./health/health.schema";
export type { HealthCheckStatus, HealthResponse } from "./health/health.schema";

export {
  RegisterRequestSchema,
  LoginRequestSchema,
  AuthTokenResponseSchema,
  MeResponseSchema,
} from "./auth/auth.schema";
export type {
  RegisterRequest,
  LoginRequest,
  AuthTokenResponse,
  MeResponse,
} from "./auth/auth.schema";

export {
  UserPublicProfileSchema,
  UpdateMeRequestSchema,
  UserSearchQuerySchema,
  UserSearchResponseSchema,
  UsernameAvailabilityResponseSchema,
  UsernameAvailabilityQuerySchema,
} from "./user/user.schema";
export type {
  UserPublicProfile,
  UpdateMeRequest,
  UserSearchQuery,
  UserSearchResponse,
  UsernameAvailabilityResponse,
  UsernameAvailabilityQuery,
} from "./user/user.schema";

export {
  ChatTypeSchema,
  ChatListItemSchema,
  OpenDirectRequestSchema,
  MuteChatRequestSchema,
  MarkReadRequestSchema,
} from "./chat/chat.schema";
export type {
  ChatType,
  ChatListItem,
  OpenDirectRequest,
  MuteChatRequest,
  MarkReadRequest,
} from "./chat/chat.schema";

export {
  MessageTypeSchema,
  MessageStatusSchema,
  MessageCallInfoSchema,
  SendMessageRequestSchema,
  EditMessageRequestSchema,
  ListMessagesQuerySchema,
  MessageSchema,
} from "./message/message.schema";
export type {
  MessageType,
  MessageStatus,
  MessageCallInfo,
  SendMessageRequest,
  EditMessageRequest,
  ListMessagesQuery,
  Message,
} from "./message/message.schema";

export {
  AttachmentKindSchema,
  PresignUploadRequestSchema,
  PresignUploadResponseSchema,
  CompleteUploadRequestSchema,
  AttachmentSchema,
  ChatMediaResponseSchema,
} from "./attachment/attachment.schema";
export type {
  AttachmentKind,
  PresignUploadRequest,
  PresignUploadResponse,
  CompleteUploadRequest,
  Attachment,
  ChatMediaResponse,
} from "./attachment/attachment.schema";

export {
  typingClientPayloadSchema,
  typingServerPayloadSchema,
  presencePayloadSchema,
  readUpdatedPayloadSchema,
  chatRemovedPayloadSchema,
  messageDeletedPayloadSchema,
} from "./ws/events.schema";
export type {
  TypingAction,
  TypingClientPayload,
  TypingServerPayload,
  PresencePayload,
  ReadUpdatedPayload,
  ChatRemovedPayload,
  MessageDeletedPayload,
  ServerToClientEvents,
  ClientToServerEvents,
} from "./ws/events.schema";

export {
  CallStatusSchema,
  CallSchema,
  StartCallBodySchema,
  CallJoinSchema,
  ActiveCallSchema,
} from "./call/call.schema";
export type { CallStatus, Call, StartCallBody, CallJoin, ActiveCall } from "./call/call.schema";

export {
  PushSubscriptionKeysSchema,
  PushSubscriptionBodySchema,
  NotificationSettingsSchema,
  NotificationSettingsPatchSchema,
  PushPayloadSchema,
} from "./notification/notification.schema";
export type {
  PushSubscriptionKeys,
  PushSubscriptionBody,
  NotificationSettings,
  NotificationSettingsPatch,
  PushPayload,
  PushMessagePayload,
  PushCallIncomingPayload,
  PushCallClosedPayload,
  PushCallMissedPayload,
} from "./notification/notification.schema";
