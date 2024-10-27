import * as BS from "../node_modules/brilliantsole/build/brilliantsole.module.min.js";
window.BS = BS;

//BS.setAllConsoleLevelFlags({ log: true });

BS.Device.ClearSensorConfigurationOnLeave = true;

const client = new BS.WebSocketClient();
console.log({ client });

window.client = client;

// THROTTLE

function throttle(func, delay) {
  let inThrottle = false;

  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), delay);
    }
  };
}

// SEARCH PARAMS

const url = new URL(location);
function setUrlParam(key, value) {
  if (history.pushState) {
    let searchParams = new URLSearchParams(window.location.search);
    if (value) {
      searchParams.set(key, value);
    } else {
      searchParams.delete(key);
    }
    let newUrl =
      window.location.protocol + "//" + window.location.host + window.location.pathname + "?" + searchParams.toString();
    window.history.pushState({ path: newUrl }, "", newUrl);
  }
}
client.addEventListener("isConnected", () => {
  if (client.isConnected) {
    setUrlParam("webSocketUrl", client.webSocket.url);
    webSocketUrlInput.value = client.webSocket.url;
  } else {
    setUrlParam("webSocketUrl");
  }
});

// CONNECTION

/** @type {HTMLInputElement} */
const webSocketUrlInput = document.getElementById("webSocketUrl");
webSocketUrlInput.value = url.searchParams.get("webSocketUrl") || "";
client.addEventListener("isConnected", () => {
  webSocketUrlInput.disabled = client.isConnected;
});

/** @type {HTMLButtonElement} */
const toggleConnectionButton = document.getElementById("toggleConnection");
toggleConnectionButton.addEventListener("click", () => {
  if (client.isConnected) {
    client.disconnect();
  } else {
    /** @type {string?} */
    let webSocketUrl;
    if (webSocketUrlInput.value.length > 0) {
      webSocketUrl = webSocketUrlInput.value;
    }
    client.connect(webSocketUrl);
  }
});
client.addEventListener("connectionStatus", () => {
  switch (client.connectionStatus) {
    case "connected":
    case "notConnected":
      toggleConnectionButton.disabled = false;
      toggleConnectionButton.innerText = client.isConnected ? "disconnect" : "connect";
      break;
    case "connecting":
    case "disconnecting":
      toggleConnectionButton.innerText = client.connectionStatus;
      toggleConnectionButton.disabled = true;
      break;
  }
});

// SCANNER

/** @type {HTMLInputElement} */
const isScanningAvailableCheckbox = document.getElementById("isScanningAvailable");
client.addEventListener("isScanningAvailable", () => {
  isScanningAvailableCheckbox.checked = client.isScanningAvailable;
});

/** @type {HTMLButtonElement} */
const toggleScanButton = document.getElementById("toggleScan");
toggleScanButton.addEventListener("click", () => {
  client.toggleScan();
});
client.addEventListener("isScanningAvailable", () => {
  toggleScanButton.disabled = !client.isScanningAvailable;
});
client.addEventListener("isScanning", () => {
  toggleScanButton.innerText = client.isScanning ? "stop scanning" : "scan";
});

// DISCOVERED DEVICES

/** @type {HTMLTemplateElement} */
const discoveredDeviceTemplate = document.getElementById("discoveredDeviceTemplate");
const discoveredDevicesContainer = document.getElementById("discoveredDevices");
/** @type {Object.<string, HTMLElement>} */
let discoveredDeviceContainers = {};

client.addEventListener("discoveredDevice", (event) => {
  const discoveredDevice = event.message.discoveredDevice;

  let discoveredDeviceContainer = discoveredDeviceContainers[discoveredDevice.bluetoothId];
  if (!discoveredDeviceContainer) {
    discoveredDeviceContainer = discoveredDeviceTemplate.content.cloneNode(true).querySelector(".discoveredDevice");

    /** @type {HTMLButtonElement} */
    const toggleConnectionButton = discoveredDeviceContainer.querySelector(".toggleConnection");
    toggleConnectionButton.addEventListener("click", () => {
      let device = client.devices[discoveredDevice.bluetoothId];
      if (device) {
        device.toggleConnection();
      } else {
        device = client.connectToDevice(discoveredDevice.bluetoothId);
      }
      onDevice(device);
    });

    /** @param {BS.Device} device */
    const onDevice = (device) => {
      device.addEventListener("connectionStatus", () => {
        updateToggleConnectionButton(device);
      });
      updateToggleConnectionButton(device);
      delete discoveredDeviceContainer._onDevice;
    };

    discoveredDeviceContainer._onDevice = onDevice;

    /** @param {BS.Device} device */
    const updateToggleConnectionButton = (device) => {
      console.log({ deviceConnectionStatus: device.connectionStatus });
      switch (device.connectionStatus) {
        case "connected":
        case "notConnected":
          toggleConnectionButton.innerText = device.isConnected ? "disconnect" : "connect";
          toggleConnectionButton.disabled = false;
          break;
        case "connecting":
        case "disconnecting":
          toggleConnectionButton.innerText = device.connectionStatus;
          toggleConnectionButton.disabled = true;
          break;
      }
    };

    discoveredDeviceContainers[discoveredDevice.bluetoothId] = discoveredDeviceContainer;
    discoveredDevicesContainer.appendChild(discoveredDeviceContainer);
  }

  updateDiscoveredDeviceContainer(discoveredDevice);
});

/** @param {BS.DiscoveredDevice} discoveredDevice */
function updateDiscoveredDeviceContainer(discoveredDevice) {
  const discoveredDeviceContainer = discoveredDeviceContainers[discoveredDevice.bluetoothId];
  if (!discoveredDeviceContainer) {
    console.warn(`no discoveredDeviceContainer for device id ${discoveredDevice.bluetoothId}`);
    return;
  }
  discoveredDeviceContainer.querySelector(".name").innerText = discoveredDevice.name;
  discoveredDeviceContainer.querySelector(".rssi").innerText = discoveredDevice.rssi;
  discoveredDeviceContainer.querySelector(".deviceType").innerText = discoveredDevice.deviceType;
}

/** @param {BS.DiscoveredDevice} discoveredDevice */
function removeDiscoveredDeviceContainer(discoveredDevice) {
  const discoveredDeviceContainer = discoveredDeviceContainers[discoveredDevice.bluetoothId];
  if (!discoveredDeviceContainer) {
    console.warn(`no discoveredDeviceContainer for device id ${discoveredDevice.bluetoothId}`);
    return;
  }

  discoveredDeviceContainer.remove();
  delete discoveredDeviceContainers[discoveredDevice.bluetoothId];
}

client.addEventListener("expiredDiscoveredDevice", (event) => {
  const discoveredDevice = event.message.discoveredDevice;
  removeDiscoveredDeviceContainer(discoveredDevice);
});

function clearDiscoveredDevices() {
  discoveredDevicesContainer.innerHTML = "";
  discoveredDeviceContainers = {};
}

client.addEventListener("notConnected", () => {
  clearDiscoveredDevices();
});

client.addEventListener("isScanning", () => {
  if (client.isScanning) {
    clearDiscoveredDevices();
  }
});

BS.DeviceManager.AddEventListener("deviceIsConnected", (event) => {
  const device = event.message.device;
  console.log("deviceIsConnected", device);
  const discoveredDeviceContainer = discoveredDeviceContainers[device.bluetoothId];
  if (!discoveredDeviceContainer) {
    return;
  }
  discoveredDeviceContainer._onDevice?.(device);
});

// AVAILABLE DEVICES

/** @type {HTMLTemplateElement} */
const connectedDeviceTemplate = document.getElementById("connectedDeviceTemplate");
const connectedDevicesContainer = document.getElementById("connectedDevices");
/** @type {Object.<string, HTMLElement>} */
let connectedDeviceContainers = {};

BS.DeviceManager.AddEventListener("connectedDevices", (event) => {
  const { connectedDevices } = event.message;
  console.log({ connectedDevices });

  connectedDevices.forEach((device) => {
    if (device.connectionType != "client" || !device.bluetoothId) {
      return;
    }
    let connectedDeviceContainer = connectedDeviceContainers[device.bluetoothId];
    if (!connectedDeviceContainer) {
      connectedDeviceContainer = connectedDeviceTemplate.content.cloneNode(true).querySelector(".connectedDevice");
      connectedDeviceContainers[device.bluetoothId] = connectedDeviceContainer;

      /** @type {HTMLSpanElement} */
      const batteryLevelSpan = connectedDeviceContainer.querySelector(".batteryLevel");
      const setBatteryLevelSpan = () => (batteryLevelSpan.innerText = device.batteryLevel);
      setBatteryLevelSpan();
      device.addEventListener("batteryLevel", () => setBatteryLevelSpan());

      /** @type {HTMLSpanElement} */
      const nameSpan = connectedDeviceContainer.querySelector(".name");
      const setNameSpan = () => (nameSpan.innerText = device.name);
      setNameSpan();
      device.addEventListener("getName", () => setNameSpan());

      /** @type {HTMLInputElement} */
      const setNameInput = connectedDeviceContainer.querySelector(".setNameInput");
      setNameInput.minLength = BS.MinNameLength;
      setNameInput.maxLength = BS.MaxNameLength;
      setNameInput.disabled = !device.isConnected;

      /** @type {HTMLButtonElement} */
      const setNameButton = connectedDeviceContainer.querySelector(".setNameButton");
      setNameButton.disabled = !device.isConnected;

      device.addEventListener("isConnected", () => {
        setNameInput.disabled = !device.isConnected;
      });
      device.addEventListener("notConnected", () => {
        setNameInput.value = "";
      });

      setNameInput.addEventListener("input", () => {
        setNameButton.disabled = setNameInput.value.length < device.minNameLength;
      });

      setNameButton.addEventListener("click", () => {
        console.log(`setting name to ${setNameInput.value}`);
        device.setName(setNameInput.value);
        setNameInput.value = "";
        setNameButton.disabled = true;
      });

      /** @type {HTMLSpanElement} */
      const deviceTypeSpan = connectedDeviceContainer.querySelector(".deviceType");
      const setDeviceTypeSpan = () => (deviceTypeSpan.innerText = device.type);
      setDeviceTypeSpan();
      device.addEventListener("getType", () => setDeviceTypeSpan());

      /** @type {HTMLButtonElement} */
      const setTypeButton = connectedDeviceContainer.querySelector(".setTypeButton");

      /** @type {HTMLSelectElement} */
      const setTypeSelect = connectedDeviceContainer.querySelector(".setTypeSelect");
      /** @type {HTMLOptGroupElement} */
      const setTypeSelectOptgroup = setTypeSelect.querySelector("optgroup");
      BS.DeviceTypes.forEach((type) => {
        setTypeSelectOptgroup.appendChild(new Option(type));
      });

      device.addEventListener("isConnected", () => {
        setTypeSelect.disabled = !device.isConnected;
      });
      setTypeSelect.disabled = !device.isConnected;

      device.addEventListener("getType", () => {
        setTypeSelect.value = device.type;
      });

      setTypeSelect.addEventListener("input", () => {
        setTypeButton.disabled = setTypeSelect.value == device.type;
      });
      setTypeSelect.value = device.type;

      setTypeButton.addEventListener("click", () => {
        device.setType(setTypeSelect.value);
        setTypeButton.disabled = true;
      });

      /** @type {HTMLPreElement} */
      const sensorConfigurationPre = connectedDeviceContainer.querySelector(".sensorConfiguration");
      const setSensorConfigurationPre = () =>
        (sensorConfigurationPre.textContent = JSON.stringify(device.sensorConfiguration, null, 2));
      setSensorConfigurationPre();
      device.addEventListener("getSensorConfiguration", () => setSensorConfigurationPre());

      /** @type {HTMLTemplateElement} */
      const sensorTypeConfigurationTemplate = connectedDeviceContainer.querySelector(
        ".sensorTypeConfigurationTemplate"
      );
      device.sensorTypes.forEach((sensorType) => {
        const sensorTypeConfigurationContainer = sensorTypeConfigurationTemplate.content
          .cloneNode(true)
          .querySelector(".sensorTypeConfiguration");
        sensorTypeConfigurationContainer.querySelector(".sensorType").innerText = sensorType;

        /** @type {HTMLInputElement} */
        const sensorRateInput = sensorTypeConfigurationContainer.querySelector(".sensorRate");
        sensorRateInput.value = 0;
        sensorRateInput.max = BS.MaxSensorRate;
        sensorRateInput.step = BS.SensorRateStep;
        sensorRateInput.addEventListener("input", () => {
          const sensorRate = Number(sensorRateInput.value);
          console.log({ sensorType, sensorRate });
          device.setSensorConfiguration({ [sensorType]: sensorRate });
        });
        sensorRateInput.disabled = !device.isConnected;

        sensorTypeConfigurationTemplate.parentElement.insertBefore(
          sensorTypeConfigurationContainer,
          sensorTypeConfigurationTemplate
        );
        sensorTypeConfigurationContainer.dataset.sensorType = sensorType;
      });

      device.addEventListener("isConnected", () => {
        connectedDeviceContainer.querySelectorAll("input").forEach((input) => (input.disabled = !device.isConnected));
      });

      const updateSensorConfigurationInputs = () => {
        for (const sensorType in device.sensorConfiguration) {
          connectedDeviceContainer.querySelector(
            `.sensorTypeConfiguration[data-sensor-type="${sensorType}"] input`
          ).value = device.sensorConfiguration[sensorType];
        }
      };

      device.addEventListener("getSensorConfiguration", () => {
        updateSensorConfigurationInputs();
      });
      updateSensorConfigurationInputs();

      /** @type {HTMLPreElement} */
      const sensorDataPre = connectedDeviceContainer.querySelector(".sensorData");
      const setSensorDataPre = (event) => (sensorDataPre.textContent = JSON.stringify(event.message, null, 2));
      device.addEventListener("sensorData", (event) => setSensorDataPre(event));

      /** @type {HTMLButtonElement} */
      const triggerVibrationButton = connectedDeviceContainer.querySelector(".triggerVibration");
      triggerVibrationButton.addEventListener("click", () => {
        device.triggerVibration([
          {
            type: "waveformEffect",
            segments: [{ effect: "alert750ms" }],
          },
        ]);
      });
      device.addEventListener("isConnected", () => {
        triggerVibrationButton.disabled = !device.isConnected;
      });
      triggerVibrationButton.disabled = !device.isConnected;

      /** @type {HTMLButtonElement} */
      const toggleConnectionButton = connectedDeviceContainer.querySelector(".toggleConnection");
      toggleConnectionButton.addEventListener("click", () => {
        device.toggleConnection();
      });
      const updateToggleConnectionButton = () => {
        switch (device.connectionStatus) {
          case "connected":
          case "notConnected":
            toggleConnectionButton.disabled = false;
            toggleConnectionButton.innerText = device.isConnected ? "disconnect" : "connect";
            break;
          case "connecting":
          case "disconnecting":
            toggleConnectionButton.innerText = device.connectionStatus;
            toggleConnectionButton.disabled = true;
            break;
        }
      };
      updateToggleConnectionButton();
      device.addEventListener("connectionStatus", () => updateToggleConnectionButton());
    }
    if (!connectedDevicesContainer.contains(connectedDeviceContainer)) {
      connectedDevicesContainer.appendChild(connectedDeviceContainer);
    }
  });

  for (const id in connectedDeviceContainers) {
    const connectedDevice = connectedDevices.find((connectedDevice) => connectedDevice.bluetoothId == id);
    if (!connectedDevice) {
      console.log("remove", id);
      connectedDeviceContainers[id].remove();
    }
  }
});

const permutationIndexInput = document.getElementById("permutationIndex");
permutationIndexInput.addEventListener("input", async () => {
  const permutationIndex = Number(permutationIndexInput.value);
  const response = await fetch("/setPermutationIndex", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ permutationIndex }),
  });
  console.log(response);
});
