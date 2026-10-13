import type { ErrorRequestHandler, RequestHandler } from "express";
import type { ApiFailure } from "@pim/shared";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiFailure = {
    error: { code: "ROUTE_NOT_FOUND", message: `No route for ${req.method} ${req.originalUrl}` },
  };
  res.status(404).json(body);
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let body: ApiFailure;
  let status: number;

  if (err instanceof AppError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, ...err.extra } };
  } else if (err?.type === "entity.parse.failed") {
    status = 400;
    body = { error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } };
  } else if (err?.type === "entity.too.large") {
    status = 413;
    body = { error: { code: "VALIDATION_ERROR", message: "Request body is too large" } };
  } else {
    status = 500;
    logger.error({ err, method: req.method, url: req.originalUrl }, "Unhandled error");
    body = { error: { code: "INTERNAL_ERROR", message: "Something went wrong on the server" } };
  }

  if (status >= 500 && err instanceof AppError) logger.warn({ code: err.code }, err.message);
  res.status(status).json(body);
};
