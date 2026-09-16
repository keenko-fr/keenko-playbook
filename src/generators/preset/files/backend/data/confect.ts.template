import type { BlobNotFoundError } from "@confect/server/BlobNotFoundError";
import type { DocumentDecodeError, DocumentEncodeError } from "@confect/server/Document";
import type { GetByIdFailure, GetByIndexFailure } from "@confect/server/QueryInitializer";
import { Effect as E, Option as O } from "effect";

// ERRORS ----------------------------------------------------------------------------------------------------------------------------------
export function dieOnCodecError<A, Err extends TaggedError, R>(effect: E.Effect<A, DocumentDecodeError | DocumentEncodeError | Err, R>) {
  return effect.pipe(dieOnDecodeError, dieOnEncodeError);
}
export function dieOnDecodeError<A, Err extends TaggedError, R>(effect: E.Effect<A, DocumentDecodeError | Err, R>) {
  return effect.pipe(E.catchTag("DocumentDecodeError", E.die));
}

export function dieOnEncodeError<A, Err extends TaggedError, R>(effect: E.Effect<A, DocumentEncodeError | Err, R>) {
  return effect.pipe(E.catchTag("DocumentEncodeError", E.die));
}

/** Use only when the caller owns an invariant proving the patch target still exists. */
export function dieOnPatchError<A, Err extends TaggedError, R>(
  effect: E.Effect<A, DocumentDecodeError | DocumentEncodeError | GetByIdFailure | Err, R>
) {
  return effect.pipe(dieOnCodecError, E.catchTag("GetByIdFailure", E.die));
}

// OPTIONS ---------------------------------------------------------------------------------------------------------------------------------
export function optionByBlob<A, R>(effect: E.Effect<A, DocumentDecodeError | BlobNotFoundError, R>) {
  return effect.pipe(E.asSome, E.catchTags({ BlobNotFoundError: () => E.succeed(O.none<A>()) }), dieOnDecodeError);
}

export function optionById<A, R>(effect: E.Effect<A, DocumentDecodeError | GetByIdFailure, R>) {
  return effect.pipe(E.asSome, E.catchTags({ GetByIdFailure: () => E.succeed(O.none<A>()) }), dieOnDecodeError);
}

export function optionByIndex<A, R>(effect: E.Effect<A, DocumentDecodeError | GetByIndexFailure, R>) {
  return effect.pipe(E.asSome, E.catchTags({ GetByIndexFailure: () => E.succeed(O.none<A>()) }), dieOnDecodeError);
}

// TYPES -----------------------------------------------------------------------------------------------------------------------------------
interface TaggedError {
  readonly _tag: string;
}
