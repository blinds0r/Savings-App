import React from "react";
import { Platform } from "react-native";
import { VISUALS } from "./visuals";
import { Harness } from "./harness/Harness";
import { Main } from "./screens/Main";

export default function AppInner() {
  const params = typeof window !== "undefined" && Platform.OS === "web" ? new URLSearchParams(window.location.search) : null;
  if (params && params.get("harness")) return <Harness visuals={VISUALS} />;
  return <Main />;
}
