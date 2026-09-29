import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";

import { TokenService } from "../auth/token.service";
import { AppConfigService } from "../config/app-config.service";
import { PrismaService } from "../prisma/prisma.service";

import { PresenceService } from "./presence.service";
import { RealtimeGateway } from "./realtime.gateway";

/** In-memory stand-in for the `ChatMember` rows `handleTyping` looks up. */
function createFakePrisma(membersByChat: Record<string, string[]>) {
  return {
    chatMember: {
      findMany: ({ where }: { where: { chatId: string } }) =>
        Promise.resolve((membersByChat[where.chatId] ?? []).map((userId) => ({ userId }))),
    },
  };
}

/** Captures every `server.to(room).emit(event, payload)` call the gateway makes. */
function createFakeServer() {
  const emitted: { room: string; event: string; payload: unknown }[] = [];
  return {
    emitted,
    server: {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => emitted.push({ room, event, payload }),
      }),
    },
  };
}

async function buildGateway(prisma: Record<string, unknown> = createFakePrisma({})) {
  const fakeConfig = {
    jwt: { accessSecret: "a".repeat(32), refreshSecret: "b".repeat(32) },
  } as AppConfigService;
  // Presence bookkeeping (T-016) is `PresenceService`'s job, not this
  // gateway's — a stub is enough to satisfy the constructor here.
  const fakePresence = { handleConnect: vi.fn(), handleDisconnect: vi.fn() };

  const moduleRef = await Test.createTestingModule({
    providers: [
      RealtimeGateway,
      TokenService,
      JwtService,
      { provide: AppConfigService, useValue: fakeConfig },
      { provide: PresenceService, useValue: fakePresence },
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();

  return {
    gateway: moduleRef.get(RealtimeGateway),
    tokens: moduleRef.get(TokenService),
  };
}

function fakeSocket(token: unknown) {
  return {
    id: "socket-1",
    handshake: { auth: { token } },
    data: {} as { userId?: string },
    disconnect: vi.fn(),
    join: vi.fn().mockResolvedValue(undefined),
  };
}

describe("RealtimeGateway", () => {
  describe("handleConnection", () => {
    it("disconnects a socket with no token", async () => {
      const { gateway } = await buildGateway();
      const socket = fakeSocket(undefined);

      gateway.handleConnection(socket as never);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it("disconnects a socket with an invalid token", async () => {
      const { gateway } = await buildGateway();
      const socket = fakeSocket("not-a-real-jwt");

      gateway.handleConnection(socket as never);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it("joins the user's room and stores the verified userId for a valid token", async () => {
      const { gateway, tokens } = await buildGateway();
      const token = tokens.signAccessToken("user-42");
      const socket = fakeSocket(token);

      gateway.handleConnection(socket as never);

      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(socket.join).toHaveBeenCalledWith("user:user-42");
      expect(socket.data.userId).toBe("user-42");
    });
  });

  describe("handleTyping", () => {
    const chatId = "11111111-1111-1111-1111-111111111111";

    it("relays to each other member's own room, not a room named by chatId", async () => {
      const prisma = createFakePrisma({ [chatId]: ["user-42", "user-7", "user-9"] });
      const { gateway, tokens } = await buildGateway(prisma);
      const { server, emitted } = createFakeServer();
      gateway.server = server as never;

      const token = tokens.signAccessToken("user-42");
      const socket = fakeSocket(token);
      gateway.handleConnection(socket as never);

      await gateway.handleTyping({ chatId, action: "typing" }, socket as never);

      expect(emitted).toEqual([
        {
          room: "user:user-7",
          event: "typing",
          payload: { chatId, action: "typing", userId: "user-42" },
        },
        {
          room: "user:user-9",
          event: "typing",
          payload: { chatId, action: "typing", userId: "user-42" },
        },
      ]);
      // Never re-notifies the sender's own room, and never a bare-chatId room.
      expect(emitted.some((e) => e.room === "user:user-42" || e.room === chatId)).toBe(false);
    });

    it("silently drops the event when the sender isn't a member of that chat", async () => {
      const prisma = createFakePrisma({ [chatId]: ["user-7", "user-9"] });
      const { gateway, tokens } = await buildGateway(prisma);
      const { server, emitted } = createFakeServer();
      gateway.server = server as never;

      const token = tokens.signAccessToken("user-42");
      const socket = fakeSocket(token);
      gateway.handleConnection(socket as never);

      await expect(
        gateway.handleTyping({ chatId, action: "typing" }, socket as never),
      ).resolves.toBeUndefined();

      expect(emitted).toEqual([]);
    });
  });
});
