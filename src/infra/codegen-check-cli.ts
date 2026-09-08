#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect as E } from "effect";

import { checkCodegen } from "./codegen-check.js";

// CLI -------------------------------------------------------------------------------------------------------------------------------------
NodeRuntime.runMain(checkCodegen(".").pipe(E.scoped, E.provide(NodeServices.layer)));
