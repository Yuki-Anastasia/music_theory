import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts` (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md) —
// clerkMiddleware()'s returned handler has the same (request, event) => Response
// shape either way, so it drops in under the new name unchanged.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip static files and Next.js internals; run on everything else, including API routes.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
