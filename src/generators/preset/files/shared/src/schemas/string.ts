import { Schema as S } from "effect";

// URL -------------------------------------------------------------------------------------------------------------------------------------
export const sUrlString = S.String.check(S.makeFilter((value) => URL.canParse(value)));
