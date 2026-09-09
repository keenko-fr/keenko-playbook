import type { ConvexQueryClient } from "@convex-dev/react-query";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { ConvexProvider } from "convex/react";

import { getLocale } from "#/paraglide/runtime";

import appCss from "#/styles.css?url";

// ROUTE -----------------------------------------------------------------------------------------------------------------------------------
export const Route = createRootRouteWithContext<RootRouteContext>()({
  head: () => ({
    links: [{ href: appCss, rel: "stylesheet" }],
    meta: [{ charSet: "utf-8" }, { content: "width=device-width, initial-scale=1", name: "viewport" }, { title: "Keenko Starter" }],
  }),
  shellComponent: RootDocument,
});
type RootRouteContext = { queryClient: QueryClient; convexQueryClient: ConvexQueryClient; token: string | undefined };

// DOCUMENT --------------------------------------------------------------------------------------------------------------------------------
function RootDocument({ children }: React.PropsWithChildren) {
  const { convexQueryClient, queryClient } = Route.useRouteContext();

  return (
    <ConvexProvider client={convexQueryClient}>
      <QueryClientProvider client={queryClient}>
        <html lang={getLocale()} suppressHydrationWarning>
          <head>
            <HeadContent />
          </head>
          <body>
            {children}
            <TanStackDevtools
              config={{ position: "bottom-right" }}
              plugins={[
                { name: "Tanstack Router", render: <TanStackRouterDevtoolsPanel /> },
                { name: "Tanstack Query", render: <ReactQueryDevtoolsPanel /> },
              ]}
            />
            <Scripts />
          </body>
        </html>
      </QueryClientProvider>
    </ConvexProvider>
  );
}
