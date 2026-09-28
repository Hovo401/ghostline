import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";

import { TokenService } from "../auth/token.service";
import { AppConfigService } from "../config/app-config.service";

import { PresenceService } from "./presence.service";
import { RealtimeGateway } from "./realtime.gateway";

async function buildGateway() {
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
    ],
  }).compile();

  return {
    gateway: moduleRef.get(RealtimeGateway),
    tokens: moduleRef.get(TokenService),
  };
}

function fakeSocket(token: unknown) {
  const roomEmit = vi.fn();
  return {
    id: "socket-1",
    handshake: { auth: { token } },
    data: {} as { userId?: string },
    disconnect: vi.fn(),
    join: vi.fn().mockResolvedValue(undefined),
    broadcast: { to: vi.fn().mockReturnValue({ emit: roomEmit }) },
    roomEmit,
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
    it("broadcasts with the socket's authenticated userId, not an empty one", async () => {
      const { gateway, tokens } = await buildGateway();
      const token = tokens.signAccessToken("user-42");
      const socket = fakeSocket(token);
      gateway.handleConnection(socket as never);

      const chatId = "11111111-1111-1111-1111-111111111111";
      gateway.handleTyping({ chatId, action: "typing" }, socket as never);

      expect(socket.broadcast.to).toHaveBeenCalledWith(chatId);
      expect(socket.roomEmit).toHaveBeenCalledWith("typing", {
        chatId,
        action: "typing",
        userId: "user-42",
      });
    });
  });
});
