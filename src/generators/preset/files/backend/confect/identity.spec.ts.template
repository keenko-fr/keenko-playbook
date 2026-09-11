import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

// SCHEMAS ---------------------------------------------------------------------------------------------------------------------------------
const sCurrentIdentity = Schema.Struct({
  email: Schema.OptionFromNullOr(Schema.String),
  subject: Schema.String,
  tokenIdentifier: Schema.String,
});
export type CurrentIdentity = typeof sCurrentIdentity.Type;

const sSynchronizedIdentity = Schema.Struct({
  email: Schema.OptionFromNullOr(Schema.String),
});
export type SynchronizedIdentity = typeof sSynchronizedIdentity.Type;

export class AuthenticationRequired extends Schema.TaggedError<AuthenticationRequired>()("AuthenticationRequired", {}) {}

// SPEC ------------------------------------------------------------------------------------------------------------------------------------
export default GroupSpec.make()
  // QUERIES -------------------------------------------------------------------------------------------------------------------------------
  .addFunction(
    FunctionSpec.publicQuery({
      name: "findCurrent",
      returns: () => Schema.OptionFromNullOr(sCurrentIdentity),
    })
  )
  .addFunction(
    FunctionSpec.publicQuery({
      error: () => AuthenticationRequired,
      name: "getCurrent",
      returns: () => sCurrentIdentity,
    })
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "findSynchronized",
      returns: () => Schema.OptionFromNullOr(sSynchronizedIdentity),
    })
  );
