export type ParsedFunctionError = {
  code?: string;
  message: string;
  status?: number;
  raw?: unknown;
};

function safeJsonParse(value: string): any | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseFunctionInvokeError(err: any): ParsedFunctionError {
  const message = typeof err?.message === "string" ? err.message : "Edge function error";
  const ctx = (err as any)?.context;

  let status: number | undefined;
  let bodyText: string | null = null;

  if (typeof ctx === "string") {
    bodyText = ctx;
  } else if (ctx && typeof ctx === "object") {
    status = typeof (ctx as any).status === "number" ? (ctx as any).status : undefined;

    const body = (ctx as any).body;
    if (typeof body === "string") bodyText = body;
    else if (body && typeof body === "object") {
      // Some environments provide already-parsed json
      return {
        code: (body as any)?.error,
        message: (body as any)?.message || message,
        status,
        raw: body,
      };
    }
  }

  const parsed = bodyText ? safeJsonParse(bodyText) : null;
  if (parsed && typeof parsed === "object") {
    return {
      code: parsed.error,
      message: parsed.message || message,
      status,
      raw: parsed,
    };
  }

  return { message, status, raw: ctx };
}
