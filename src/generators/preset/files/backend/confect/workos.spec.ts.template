import { FunctionSpec, GroupSpec } from "@confect/core";

import type { backfillUsers } from "./workos";

// SPEC ------------------------------------------------------------------------------------------------------------------------------------
export default GroupSpec.make()
  // INTERNAL MUTATIONS --------------------------------------------------------------------------------------------------------------------
  .addFunction(FunctionSpec.convexInternalMutation<typeof backfillUsers>()("backfillUsers"));
