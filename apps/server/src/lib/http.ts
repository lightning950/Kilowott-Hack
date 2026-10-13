import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Wraps an async handler so rejected promises reach the error middleware (Express 4). */
export const handle =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

/** Sends `{ data }`, the success half of ApiResponse<T>. */
export const send = <T>(res: Response, data: T, status = 200) => {
  res.status(status).json({ data });
};
