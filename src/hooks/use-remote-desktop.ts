import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { remoteRequest } from "@/lib/remote.functions";
import { readRemoteToken } from "@/lib/remote-storage";
import { bridge, loadSettings } from "@/lib/jarvis";
import type { RemoteJob } from "@/lib/remote-schema";

export function useRemoteDesktop(run: (job: RemoteJob) => Promise<{ status: "done" | "failed" | "choose"; result: string }>, busy: () => boolean) {
  const request = useServerFn(remoteRequest);
  const latest = useRef({ run, busy });
  latest.current = { run, busy };
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const token = readRemoteToken();
        if (!stopped && bridge() && token && !latest.current.busy()) {
          const settings = loadSettings();
          const channels = settings.discordServers.map((channel) => channel.name);
          const response = await request({ data: { op: "poll", token, channels } });
          if (response.job && !stopped) {
            let outcome: { status: "done" | "failed" | "choose"; result: string };
            try { outcome = await latest.current.run(response.job); }
            catch { outcome = { status: "failed", result: "The PC could not complete this command." }; }
            await request({ data: { op: "finish", token, id: response.job.id, ...outcome } });
          }
        }
      } catch { /* Retry connection on the next poll; claimed jobs are never repeated. */ }
      if (!stopped) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [request]);
}