import { expect, test } from "@playwright/test";

const escapeRegExp = (value: string) => value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

test("Google auth reaches Convex identity, WorkOS synchronization, and sign-out", async ({ page }) => {
  const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://localhost:3210";

  await page.goto("/");
  const hostedUiDocumentRequest = page.waitForRequest(
    (request) => request.isNavigationRequest() && /(?:authkit|workos)/u.test(request.url())
  );
  await Promise.all([
    hostedUiDocumentRequest,
    page.waitForURL(/(?:authkit|workos)/u),
    page.getByRole("link", { name: "Mon espace" }).click(),
  ]);
  await expect(page).toHaveURL(/(?:authkit|workos)/u);

  // Complete Google authentication in AuthKit Hosted UI, then resume the test in Playwright Inspector.
  await page.pause();

  await page.waitForURL(new RegExp(`^${escapeRegExp(baseUrl)}/mon-espace(?:[?#]|$)`, "u"));
  await expect(page.getByTestId("convex-authenticated")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("workos-user-synchronized")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Me déconnecter" }).click();
  await expect(page.getByRole("link", { name: "Me connecter" })).toBeVisible();
});
