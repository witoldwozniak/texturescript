// The one error type for broken input files: says where, then what.
import { Schema } from "effect"

// Note: JavaScriptCore gives every Error its own `line` and `column` (of the throw site),
// so the location lives in `at` rather than in top-level fields.
export class SpecError extends Schema.TaggedError<SpecError>()("SpecError", {
  reason: Schema.String,
  file: Schema.optional(Schema.String),
  at: Schema.optional(Schema.Struct({ line: Schema.Number, column: Schema.optional(Schema.Number) })),
}) {
  override get message() {
    const where = [this.file, this.at?.line, this.at?.column].filter((p) => p !== undefined)
    return where.length ? `${where.join(":")}: ${this.reason}` : this.reason
  }
}

export const specError = (reason: string, line?: number, column?: number) =>
  new SpecError({ reason, ...(line !== undefined && { at: { line, ...(column !== undefined && { column }) } }) })

/** The same error, located in `file` (core parsers only know lines). */
export const inFile = (e: SpecError, file: string) =>
  e.file ? e : new SpecError({ reason: e.reason, file, ...(e.at && { at: e.at }) })
