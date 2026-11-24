import { randomUUID } from "node:crypto";
import type { RequestHandler, Response } from "express";
import type { Logger } from "./logger.js";

// CONTRACT.md "Errors". Anything else gets replaced so a header can't put junk in the logs.
const CLIENT_ID_RE = /^[\w-]{1,64}$/;

export function requestIdOf(res: Response): string | undefined {
  return res.locals.requestId as string | undefined;
}

// One log line per request. Path only: query strings and bodies can hold user data.
export function requestLog(logger: Logger, clock: () => number = () => performance.now()): RequestHandler {
  return (req, res, next) => {
    const sent = req.get("X-Request-Id");
    const requestId = sent && CLIENT_ID_RE.test(sent) ? sent : randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    const started = clock();
    let logged = false;
    const write = (aborted: boolean) => {
      if (logged) return;
      logged = true;
      const status = res.statusCode;
      logger({
        level: aborted ? "warn" : status >= 500 ? "error" : status >= 400 ? "warn" : "info",
        msg: aborted ? "request aborted" : "request",
        requestId,
        method: req.method,
        path: req.path,
        status,
        durationMs: Math.round((clock() - started) * 10) / 10,
      });
    };
    res.on("finish", () => write(false));
    // close without finish = client hung up first.
    res.on("close", () => write(!res.writableFinished));
    next();
  };
}
