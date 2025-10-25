import type { Request as ExpressRequest, Response as ExpressResponse, RequestHandler, NextFunction } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { fromNodeHeaders } from "better-auth/node";

const FORWARDED_HEADER_BLOCKLIST = new Set([
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "access-control-allow-methods",
  "access-control-allow-headers",
  "access-control-max-age",
]);

export const sendFetchResponse = async (
  fetchResponse: globalThis.Response,
  res: ExpressResponse,
): Promise<void> => {
  res.status(fetchResponse.status);

  fetchResponse.headers.forEach((value, key) => {
    if (FORWARDED_HEADER_BLOCKLIST.has(key.toLowerCase())) {
      return;
    }
    res.append(key, value);
  });

  const body = fetchResponse.body;
  if (!body) {
    const payload = await fetchResponse.text();
    if (payload.length > 0) {
      res.send(payload);
      return;
    }

    res.end();
    return;
  }

  const nodeStream = Readable.fromWeb(body as unknown as NodeReadableStream);

  try {
    await pipeline(nodeStream, res);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ERR_STREAM_PREMATURE_CLOSE") {
      return;
    }
    throw error;
  }
};

export interface FetchRequestOptions {
  body?: BodyInit | null;
}

export const createFetchRequest = (
  req: ExpressRequest,
  baseUrl: string,
  options?: FetchRequestOptions,
): globalThis.Request => {
  const url = new URL(req.originalUrl, baseUrl);
  const headers = fromNodeHeaders(req.headers);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const requestInit: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
  };

  if (options?.body !== undefined) {
    headers.delete("content-length");
    requestInit.body = options.body;
  } else if (hasBody) {
    requestInit.body = req as unknown as BodyInit;
    requestInit.duplex = "half";
  }

  return new Request(url, requestInit);
};

export const adaptFetchHandler = (
  handler: (request: globalThis.Request) => Promise<globalThis.Response>,
  baseUrl: string,
): RequestHandler =>
  async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    try {
      const fetchResponse = await handler(createFetchRequest(req, baseUrl));
      await sendFetchResponse(fetchResponse, res);
    } catch (error) {
      next(error);
    }
  };

export const readRequestBody = async (req: ExpressRequest): Promise<Buffer> => {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk, "utf-8"));
    } else {
      chunks.push(chunk);
    }
  }

  return Buffer.concat(chunks);
};
