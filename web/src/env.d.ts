/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    /**
     * Session payload từ JWT cookie. null nếu chưa login.
     * Set bởi src/middleware.ts.
     */
    user: {
      sub: number;
      phone: string;
      is_onboarded: boolean;
    } | null;
    /**
     * Current UI locale. Resolved by middleware from
     *   1. ?lang= query (overrides + persists cookie)
     *   2. vv_locale cookie
     *   3. Accept-Language header
     *   4. Default "vi"
     */
    locale: "vi" | "en";
  }
}
