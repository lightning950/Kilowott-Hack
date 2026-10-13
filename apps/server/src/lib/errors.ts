import type { ErrorCode } from "@pim/shared";

/** The only error type routes and services throw on purpose. Mapped 1:1 to the API error shape. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    public readonly extra: { fieldErrors?: Record<string, string>; details?: unknown } = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string, id: number | string) =>
  new AppError("NOT_FOUND", 404, `${what} ${id} was not found`);

export const skuTaken = (sku: string, field = "sku") =>
  new AppError("SKU_TAKEN", 409, `SKU ${sku} is already used by another product or variation`, {
    fieldErrors: { [field]: "This SKU is already in use" },
  });
