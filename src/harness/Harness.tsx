import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import type { VisualDef, SceneHandle } from "../visuals/contract";
import type { VisualState } from "../model/types";

/** Web-only review harness: ?harness=<key>&pct=0.42&bg=<name>. Renders the scene and exposes window.__play. */
export function Harness({ visuals }: { visuals: Record<string, VisualDef> }) {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const key = params.get("harness") || Object.keys(visuals)[0];
  const def = visuals[key];
  const [state, setState] = useState<VisualState>({ pct: +(params.get("pct") || 0.42), surplus: +(params.get("surplus") || 0), goal: 3000 });
  const ref = useRef<SceneHandle>(null);
  const bg = params.get("bg");
  useEffect(() => {
    (window as any).__play = async (kind: "add" | "ms", v: number) => {
      if (!ref.current) return "no ref";
      if (kind === "add") { await ref.current.playAdd(v); setState((s) => ({ ...s, pct: Math.min(1, s.pct + v / s.goal) })); }
      else await ref.current.playMilestone(v);
      return "done";
    };
    (window as any).__setState = (s: Partial<VisualState>) => setState((x) => ({ ...x, ...s }));
    (window as any).__ready = true;
  }, []);
  if (!def) return <Text>Unknown visual {key}</Text>;
  return (
    <View style={{ flex: 1, backgroundColor: bg && def.backgrounds[bg] ? def.backgrounds[bg].page : def.plain, alignItems: "center" }}>
      <View style={{ width: 390, height: 300 }} testID="stage">
        <def.Scene ref={ref} state={state} width={390} height={300} motion background={bg} />
      </View>
      <View style={{ flexDirection: "row", gap: 8, padding: 8 }}>
        {[6, 50, 140].map((a) => <Pressable key={a} onPress={() => (window as any).__play("add", a)} style={{ padding: 10, backgroundColor: "#ddd" }}><Text>+${a}</Text></Pressable>)}
        <Pressable onPress={() => (window as any).__play("ms", 20)} style={{ padding: 10, backgroundColor: "#ddd" }}><Text>Milestone</Text></Pressable>
      </View>
    </View>
  );
}
