import React from "react";
import { Platform, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

// Nothing that touches Skia may be imported here: on the web CanvasKit must load first, so the app body is imported lazily.
export default function App() {
  let body: React.ReactNode;
  if (Platform.OS === "web") {
    const { WithSkiaWeb } = require("@shopify/react-native-skia/lib/module/web");
    body = <WithSkiaWeb opts={{ locateFile: (f: string) => "/" + f }} getComponent={() => import("./src/AppInner")} fallback={<Text>Loading…</Text>} />;
  } else {
    const { default: AppInner } = require("./src/AppInner");
    body = <AppInner />;
  }
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>{body}</SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
