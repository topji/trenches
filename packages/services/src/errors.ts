/** Errors that map straight onto HTTP responses; the message is user-facing copy. */
export class ServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export const notFound = (msg = "This battle doesn't exist or the link is wrong.") => new ServiceError(404, msg);
export const forbidden = (msg = "Only the host can do this.") => new ServiceError(403, msg);
export const conflict = (msg: string) => new ServiceError(409, msg);
export const badRequest = (msg: string, field?: string) => new ServiceError(400, msg, field);
