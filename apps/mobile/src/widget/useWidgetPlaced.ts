import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { observeWidgetPin, widgetSnapshot } from "./placement";

/** True once the OS reports a prayer widget on the home screen. Widget prompts hide while it
 *  is true. Re-read when the app returns to the foreground (the reader may have just placed or
 *  removed one) and when an Android pin lands. Unknown reads as not placed. */
export function useWidgetPlaced(): boolean {
  const [placed, setPlaced] = useState(false);
  useEffect(() => {
    let alive = true;
    const read = () =>
      void widgetSnapshot()
        .then((s) => {
          if (alive) setPlaced(s.present === true);
        })
        .catch(() => undefined);
    read();
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") read();
    });
    const pin = observeWidgetPin(read);
    return () => {
      alive = false;
      app.remove();
      pin?.remove();
    };
  }, []);
  return placed;
}
