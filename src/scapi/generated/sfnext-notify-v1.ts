export interface paths {
  "/notify": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["notify"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: never;
  responses: never;
  parameters: {
    siteId: string;
    locale: string;
  };
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export type external = Record<string, never>;
export interface operations {
  notify: {
    parameters: {
      query: {
        siteId: string;
        locale?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json":
          | { type: "passwordless-magic-link"; recipient: string; data: { magicLinkPath: string } }
          | { type: "password-reset"; recipient: string; data: { magicLinkPath: string } }
          | { type: "otp"; recipient: string; data: { token: string } }
          | { type: "glo-access-code"; recipient: string; data: { orderNo: string; accessCode: string } };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            success?: boolean;
            data?: {
              magicLink?: string;
            };
          };
        };
      };
    };
  };
}
