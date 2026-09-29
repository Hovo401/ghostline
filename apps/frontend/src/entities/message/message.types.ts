import type { Message, MessageStatus, MessageType, SendMessageRequest } from "@ghostline/contracts";

export type { Message, MessageStatus, MessageType, SendMessageRequest };

/**
 * Client-only optimistic-send state layered onto a `Message` — never part
 * of the wire format (FR-MSG-08). `pending` is true from the moment the
 * composer submits until either the POST response or the `message:new`
 * echo lands; `failed` flips on if the request errors, offering a retry
 * (FR-MSG-07) instead of silently dropping the message.
 */
export interface ChatMessage extends Message {
  pending?: boolean;
  failed?: boolean;
}
