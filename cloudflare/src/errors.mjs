export class HttpError extends Error {
  constructor(status, code, upstreamStatus) {
    super(code); this.status = status; this.code = code; this.upstreamStatus = upstreamStatus;
  }
}
