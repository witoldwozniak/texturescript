// Flags shared by every command.
import { Flag } from "effect/cli"

/** Machine-readable output for agents and scripts. */
export const json = Flag.Boolean("json").pipe(
  Flag.withDefault(false),
  Flag.withDescription("print JSON instead of text"),
)

export const jar = Flag.String("jar").pipe(
  Flag.optional,
  Flag.withDescription("Minecraft client jar to read; default: the newest one your launcher downloaded"),
)
