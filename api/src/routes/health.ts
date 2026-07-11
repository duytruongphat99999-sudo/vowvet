/**
 * GET /api/v1/health
 * Trả status của các dịch vụ phụ thuộc: Baserow + R2.
 * Dùng cho liveness check + để frontend hiển thị trạng thái hệ thống.
 */
import { Hono } from "hono";
import { pingBaserow } from "@shared/baserow.ts";
import { pingR2 } from "@shared/r2.ts";

export const healthRoute = new Hono();

healthRoute.get("/", async (c) => {
  const [baserowOk, r2Ok] = await Promise.all([pingBaserow(), pingR2()]);
  const allOk = baserowOk && r2Ok;

  return c.json(
    {
      status: allOk ? "ok" : "degraded",
      services: {
        baserow: baserowOk ? "ok" : "fail",
        r2: r2Ok ? "ok" : "fail",
      },
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    allOk ? 200 : 503
  );
});
