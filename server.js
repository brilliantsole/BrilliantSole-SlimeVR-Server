import express from "express";
import https from "https";
import http from "http";
const app = express();
import fs from "fs";
import ip from "ip";
import { WebSocketServer } from "ws";
import * as BS from "brilliantsole/node";
import * as THREE from "three";

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

const eulers = {
  left: new THREE.Euler(0, 0, 0, "ZXY"),
  right: new THREE.Euler(0, 0, 0, "ZXY"),
};

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

devicePair.addEventListener("deviceSensorData", (event) => {
  const { side, sensorType } = event.message;
  let isRotation = false;
  switch (sensorType) {
    case "gameRotation":
      {
        const quaternion = gameRotation[side];
        quaternion.copy(event.message.gameRotation);
        quaternion.premultiply(inverseGameRotation[side]);

        const euler = eulers[side];
        euler.setFromQuaternion(quaternion);
        const [pitch, yaw, roll, order] = euler.toArray();
        args = [-pitch, -yaw, roll].map((value) => {
          return {
            type: "f",
            value: THREE.MathUtils.radToDeg(value),
          };
        });
        latestGameRotation[side].copy(event.message.gameRotation);
        isRotation = true;
      }
      break;
    case "rotation":
      {
        const quaternion = rotation[side];
        quaternion.copy(event.message.rotation);
        quaternion.premultiply(inverseRotation[side]);

        const euler = eulers[side];
        euler.setFromQuaternion(quaternion);
        const [pitch, yaw, roll, order] = euler.toArray();
        args = [-pitch, -yaw, roll].map((value) => {
          return {
            type: "f",
            value: THREE.MathUtils.radToDeg(value),
          };
        });
        latestRotation[side].copy(event.message.rotation);
        isRotation = true;
      }
      break;
    default:
      break;
  }

  if (isRotation) {
    if (sensorType == "gameRotation" && event.message.device.sensorConfiguration.rotation != 0) {
      console.warn("not using gameRotation data to rotate foot - rotation data is already enabled");
      return;
    }

    // FILL
  }
});
