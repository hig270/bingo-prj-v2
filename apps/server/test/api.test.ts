import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("API", () => {
  it("GET /api/health は ok を返す", async () => {
    const res = await exports.default.fetch("https://example.com/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("Worker からルームの Durable Object を RPC で呼べる", async () => {
    const res = await exports.default.fetch(
      "https://example.com/r/test-room/api/ping",
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: "pong" });
  });

  it("不正なルーム ID は 400 を返す", async () => {
    const res = await exports.default.fetch(
      "https://example.com/r/bad%20id/api/ping",
    );
    expect(res.status).toBe(400);
  });
});

describe("RoomDO", () => {
  it("ルームの RPC を直接呼べる", async () => {
    const stub = env.ROOM.getByName("direct-room");
    expect(await stub.ping()).toBe("pong");
  });
});
