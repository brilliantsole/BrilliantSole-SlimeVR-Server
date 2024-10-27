import express from "express";
import https from "https";
import http from "http";
const app = express();
import fs from "fs";
import ip from "ip";
import { WebSocketServer } from "ws";
import * as BS from "brilliantsole/node";
import * as THREE from "three";

import { MACAddress, Quaternion } from "@slimevr/common";
import {
  BoardType,
  FirmwareFeatureFlags,
  RotationDataType,
  SensorStatus,
  SensorType,
} from "@slimevr/firmware-protocol";
import { EmulatedSensor, EmulatedTracker } from "@slimevr/tracker-emulation";

// HTTPS SERVER
app.use(function (req, res, next) {
  res.header("Cross-Origin-Opener-Policy", "same-origin");
  res.header("x-frame-options", "same-origin");

  next();
});
app.use(express.static("./"));
app.use(express.json());

const serverOptions = {
  key: fs.readFileSync("./sec/key.pem"),
  cert: fs.readFileSync("./sec/cert.pem"),
};

const httpServer = http.createServer(app);
httpServer.listen(80);
const httpsServer = https.createServer(serverOptions, app);
httpsServer.listen(443, () => {
  console.log(`server listening on https://${ip.address()}`);
});

// WEBSOCKET
const wss = new WebSocketServer({ server: httpsServer });
const webSocketServer = new BS.WebSocketServer();
webSocketServer.clearSensorConfigurationsWhenNoClients = false;
webSocketServer.server = wss;

const devicePair = BS.DevicePair.shared;

const inverseGameRotation = {
  left: new THREE.Quaternion(),
  right: new THREE.Quaternion(),
};
const gameRotation = {
  left: new THREE.Quaternion(),
  right: new THREE.Quaternion(),
};
const gameRotationEuler = {
  left: new THREE.Euler(0, 0, 0, "YXZ"),
  right: new THREE.Euler(0, 0, 0, "YXZ"),
};
const latestGameRotation = {
  left: new THREE.Quaternion(),
  right: new THREE.Quaternion(),
};

const inverseRotation = {
  left: new THREE.Quaternion(),
  right: new THREE.Quaternion(),
};
const rotation = {
  left: new THREE.Quaternion(),
  right: new THREE.Quaternion(),
};
const rotationEuler = {
  left: new THREE.Euler(0, 0, 0, "YXZ"),
  right: new THREE.Euler(0, 0, 0, "YXZ"),
};
const latestRotation = {
  left: new THREE.Quaternion(),
  right: new THREE.Quaternion(),
};

function resetGameRotation() {
  BS.InsoleSides.forEach((side) => {
    gameRotationEuler[side].setFromQuaternion(latestGameRotation[side]);
    gameRotationEuler[side].x = gameRotation[side].z = 0;
    gameRotationEuler[side].y *= -1;
    inverseGameRotation[side].setFromEuler(gameRotationEuler[side]);
  });
}
function resetRotation() {
  BS.InsoleSides.forEach((side) => {
    rotationEuler[side].setFromQuaternion(latestRotation[side]);
    rotationEuler[side].x = rotation[side].z = 0;
    rotationEuler[side].y *= -1;
    inverseRotation[side].setFromEuler(rotationEuler[side]);
  });
}
app.get("/resetRotation", (req, res) => {
  console.log("resetting rotation");
  resetGameRotation();
  resetRotation();
  res.send();
});

/** @type {Object<string, EmulatedTracker>} */
const trackers = {};
/** @type {Object<string, EmulatedSensor[]>} */
const trackerSensors = {};
/** @type {Object<string, Quaternion>} */
const trackerQuaternions = {};

devicePair.addEventListener("deviceIsConnected", async (event) => {
  const { side, device } = event.message;

  if (!device.isConnected) {
    const tracker = trackers[side];
    if (tracker) {
      console.log(`removing ${side} tracker`);
      tracker.disconnectFromServer();
      tracker.deinit();
    }
  } else {
    const existingTracker = trackers[side];
    if (existingTracker) {
      if (existingTracker.device == device) {
        console.log(`existing ${side} tracker reconnected`);
        existingTracker.init();
        return;
      } else {
        console.log(`replacing existing ${side} tracker`);
        existingTracker.disconnectFromServer();
        existingTracker.deinit();
      }
    }

    console.log(`creating ${side} tracker...`);

    // emulating a consistent mac address using the device hardware id...
    const firstSixBytesHex = device.id.slice(0, 12);
    const macAddressBytes = [];
    for (let i = 0; i < firstSixBytesHex.length; i += 2) {
      const byte = parseInt(firstSixBytesHex.slice(i, i + 2), 16);
      macAddressBytes.push(byte);
    }

    const macAddress = new MACAddress(macAddressBytes);

    const tracker = new EmulatedTracker(macAddress, "0.0.1", new FirmwareFeatureFlags(new Map()), BoardType.CUSTOM);
    trackers[side] = tracker;

    tracker.on("ready", (ip, port) => console.log(`ready and running on ${ip}:${port}`));
    tracker.on("unready", () => console.log("unready"));

    tracker.on("error", (err) => console.error(err));

    tracker.on("searching-for-server", () => console.log("searching for server..."));
    tracker.on("stopped-searching-for-server", () => console.log("stopped searching for server"));

    tracker.on("connected-to-server", (ip, port) => console.log("connected to server", ip, port));
    tracker.on("disconnected-from-server", (reason) => {
      console.log("disconnected from server", reason);
      tracker.searchForServer();
    });

    tracker.on("server-feature-flags", (flags) => console.log("server feature flags", flags.getAllEnabled()));

    tracker.on("incoming-packet", (packet) => console.log("incoming packet", packet));
    tracker.on("unknown-incoming-packet", (buf) => console.log("unknown packet", buf));
    tracker.on("outgoing-packet", (packet) => console.log("outgoing packet", packet));

    await tracker.init();

    trackerSensors[side] = await tracker.addSensor(SensorType.UNKNOWN, SensorStatus.OK);
  }
});

devicePair.addEventListener("deviceBatteryLevel", (event) => {
  const { side, batteryLevel } = event.message;
  const tracker = trackers[side];
  tracker.changeBatteryLevel(3.7, batteryLevel);
});

devicePair.addEventListener("deviceSensorData", (event) => {
  const { side, sensorType } = event.message;
  let isRotation = false;
  switch (sensorType) {
    case "gameRotation":
      {
        const quaternion = gameRotation[side];
        quaternion.copy(event.message.gameRotation);
        quaternion.premultiply(inverseGameRotation[side]);
        latestGameRotation[side].copy(event.message.gameRotation);

        const { w, x, y, z } = quaternion;
        trackerQuaternions[side] = new Quaternion(x, y, z, w);
      }
      isRotation = true;
      break;
    case "rotation":
      {
        const quaternion = rotation[side];
        quaternion.copy(event.message.rotation);
        quaternion.premultiply(inverseRotation[side]);
        latestRotation[side].copy(event.message.rotation);

        const { w, x, y, z } = quaternion;
        trackerQuaternions[side] = new Quaternion(x, y, z, w);
      }
      isRotation = true;
      break;
    default:
      break;
  }

  if (isRotation) {
    if (sensorType == "gameRotation" && event.message.device.sensorConfiguration.rotation != 0) {
      console.warn("not using gameRotation data to rotate foot - rotation data is already enabled");
      return;
    }

    const trackerQuaternion = trackerQuaternions[side];
    if (!trackerQuaternion) {
      console.log("no trackerQuaternion defined");
      return;
    }

    const trackerSensor = trackerSensors[side];
    if (!trackerSensor) {
      console.log("no trackerSensor defined");
      return;
    }
    trackerSensor.sendRotation(RotationDataType.NORMAL, trackerQuaternion, 0);
  }
});
