import { useEffect } from "react";
import { inputState, worldState } from "../store/useGameStore";
import { useGameStore } from "../store/useGameStore";
import { playSfx } from "../lib/audio";

/**
 * Global keyboard listener that writes into the transient inputState object.
 * WASD / arrows -> move, Shift -> nos, Space -> jump/handbrake,
 * F -> interact, Q -> weapon wheel, 1/2/3 -> direct weapon select.
 */
export default function useKeyboard() {
  useEffect(() => {
    const keys = {};

    const updateMove = () => {
      let x = 0;
      let z = 0;
      if (keys["KeyW"] || keys["ArrowUp"]) z -= 1;
      if (keys["KeyS"] || keys["ArrowDown"]) z += 1;
      if (keys["KeyA"] || keys["ArrowLeft"]) x -= 1;
      if (keys["KeyD"] || keys["ArrowRight"]) x += 1;
      const len = Math.hypot(x, z) || 1;
      inputState.move.x = x / len;
      inputState.move.z = z / len;
      inputState.moveActive = x !== 0 || z !== 0;
      inputState.gas = keys["KeyW"] || keys["ArrowUp"] ? 1 : 0;
      inputState.brake = keys["KeyS"] || keys["ArrowDown"] ? 1 : 0;
    };

    const onDown = (e) => {
      if (keys[e.code]) return; // ignore repeat
      keys[e.code] = true;
      const st = useGameStore.getState();
      switch (e.code) {
        case "ShiftLeft":
        case "ShiftRight":
          inputState.nos = true;
          inputState.boost = true; // helicopter boost
          break;
        case "Space":
          inputState.jump = true;
          inputState.handbrake = true;
          inputState.up = true; // helicopter ascend
          e.preventDefault();
          break;
        case "ControlLeft":
        case "ControlRight":
        case "KeyC":
          inputState.down = true; // helicopter descend
          e.preventDefault();
          break;
        case "KeyZ":
          // Alternate descend key — Ctrl can be hijacked by browser shortcuts or
          // the OS on some laptops, so Z is a reliable fallthrough.
          inputState.down = true;
          break;
        case "KeyX":
          // Alternate ascend key — pairs with Z for ascend/descend on laptops
          // where Space/Ctrl feel awkward mid-flight.
          inputState.up = true;
          break;
        case "PageUp":
          inputState.up = true;
          e.preventDefault();
          break;
        case "PageDown":
          inputState.down = true;
          e.preventDefault();
          break;
        case "KeyF":
          inputState.interact = true;
          break;
        case "KeyR":
          st.reloadCurrent();
          break;
        case "KeyQ":
          inputState.weaponWheel = true;
          st.openWheel();
          break;
        case "Digit1":
          st.setWeapon("pistol");
          playSfx("switch");
          break;
        case "Digit2":
          st.setWeapon("rifle");
          playSfx("switch");
          break;
        case "Digit3":
          st.setWeapon("rocket");
          playSfx("switch");
          break;
        case "Digit4":
          st.setWeapon("bow");
          playSfx("switch");
          break;
        default:
          break;
      }
      updateMove();
    };

    const onUp = (e) => {
      keys[e.code] = false;
      const st = useGameStore.getState();
      switch (e.code) {
        case "ShiftLeft":
        case "ShiftRight":
          inputState.nos = false;
          inputState.boost = false;
          break;
        case "Space":
          inputState.jump = false;
          inputState.handbrake = false;
          inputState.up = false;
          break;
        case "ControlLeft":
        case "ControlRight":
        case "KeyC":
        case "KeyZ":
          // Clear descend only when NONE of the descend keys remain held, so the
          // flag can't get stuck if the player rolls from Ctrl to Z.
          if (
            !keys["ControlLeft"] &&
            !keys["ControlRight"] &&
            !keys["KeyC"] &&
            !keys["KeyZ"] &&
            !keys["PageDown"]
          ) {
            inputState.down = false;
          }
          break;
        case "KeyX":
        case "PageUp":
          if (!keys["KeyX"] && !keys["PageUp"] && !keys["Space"]) {
            inputState.up = false;
          }
          break;
        case "PageDown":
          if (
            !keys["PageDown"] &&
            !keys["ControlLeft"] &&
            !keys["ControlRight"] &&
            !keys["KeyC"] &&
            !keys["KeyZ"]
          ) {
            inputState.down = false;
          }
          break;
        case "KeyQ":
          inputState.weaponWheel = false;
          st.closeWheel();
          break;
        default:
          break;
      }
      updateMove();
    };

    const onWheel = (e) => {
      const st = useGameStore.getState();
      // While flying a helicopter, the mouse wheel ascends/descends — much
      // easier on a laptop trackpad than reaching for Ctrl/Space. Otherwise it
      // cycles weapons as before.
      if (st.activeVehicle && worldState.vehicleType === "heli") {
        if (e.deltaY < 0) inputState.up = true;
        else inputState.down = true;
        // clear shortly after so it's a nudge, not held forever
        clearTimeout(wheelHeliT);
        wheelHeliT = setTimeout(() => {
          inputState.up = false;
          inputState.down = false;
        }, 140);
        return;
      }
      st.cycleWeapon(e.deltaY > 0 ? 1 : -1);
    };
    let wheelHeliT = null;

    const onMouseDown = (e) => {
      // Ignore the synthetic click that accompanies acquiring/releasing pointer
      // lock, so re-capturing the mouse never fires a stray shot.
      if (window.__zcodeSwallowClick && window.__zcodeSwallowClick()) return;
      const st = useGameStore.getState();
      if (e.button === 0) inputState.shoot = true;
      if (e.button === 2) {
        inputState.aim = true;
        if (!st.activeVehicle) st.setCameraMode("aim");
      }
    };
    const onMouseUp = (e) => {
      const st = useGameStore.getState();
      if (e.button === 0) inputState.shoot = false;
      if (e.button === 2) {
        inputState.aim = false;
        if (st.cameraMode === "aim") st.setCameraMode("foot");
      }
    };
    const onContext = (e) => e.preventDefault();

    const onMouseMove = (e) => {
      inputState.look.x += e.movementX || 0;
      inputState.look.y += e.movementY || 0;
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("contextmenu", onContext);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("contextmenu", onContext);
    };
  }, []);
}
