import { createServerFn } from "@tanstack/react-start";
import { remoteInput } from "./remote-schema";

export const remoteRequest = createServerFn({ method: "POST" })
  .inputValidator((input) => remoteInput.parse(input))
  .handler(async ({ data }) => {
    const { handleRemote } = await import("./remote.server");
    return handleRemote(data);
  });
