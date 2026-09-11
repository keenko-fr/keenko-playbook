import { createServerFn } from "@tanstack/react-start";
import { getAuth } from "@workos/authkit-tanstack-react-start";

export const getProtectedViewer = createServerFn({ method: "GET" }).handler(async () => {
  const { user } = await getAuth();
  if (user === null) throw new Error("Not authenticated");

  return { email: user.email, id: user.id };
});
