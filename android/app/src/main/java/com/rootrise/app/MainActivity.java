package com.rootrise.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.webkit.GeolocationPermissions;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.JavaScriptReplyProxy;

import com.hoho.android.usbserial.driver.UsbSerialDriver;
import com.hoho.android.usbserial.driver.UsbSerialPort;
import com.hoho.android.usbserial.driver.UsbSerialProber;
import com.hoho.android.usbserial.util.SerialInputOutputManager;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
  private static final int GEOLOCATION_REQUEST_CODE = 1001;
  private static final int PHONE_LOCATION_PERMISSION_REQUEST_CODE = 1003;
  private static final int BLUETOOTH_PERMISSION_REQUEST_CODE = 1002;
  private static final String USB_PERMISSION_ACTION = "com.rootrise.app.USB_PERMISSION";
  private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
  private static final UUID BLE_SERVICE = UUID.fromString("6e400001-b5a3-f393-e0a9-e50e24dcca9e");
  private static final UUID BLE_RX = UUID.fromString("6e400002-b5a3-f393-e0a9-e50e24dcca9e");
  private static final UUID BLE_TX = UUID.fromString("6e400003-b5a3-f393-e0a9-e50e24dcca9e");
  private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();
  private WebView web;
  private WebViewAssetLoader assetLoader;
  private boolean webBridgeSupported = false;
  private GeolocationPermissions.Callback geolocationCallback;
  private String geolocationOrigin;
  private Runnable pendingBluetoothAction;
  private String activeTransport = "";
  private volatile boolean manuallyDisconnecting = false;
  private BluetoothSocket bluetoothSocket;
  private BluetoothDevice classicDevice;
  private int classicReconnectAttempts = 0;
  private Runnable classicReconnectRunnable;
  private BluetoothGatt bluetoothGatt;
  private BluetoothGattCharacteristic bleWriteCharacteristic;
  private UsbManager usbManager;
  private UsbSerialPort usbPort;
  private UsbDeviceConnection usbConnection;
  private SerialInputOutputManager usbIoManager;
  private UsbDevice pendingUsbDevice;
  private BluetoothLeScanner bleScanner;
  private ScanCallback bleScanCallback;
  private boolean usbReceiverRegistered = false;
  private LocationManager locationManager;
  private LocationListener locationListener;
  private Runnable locationTimeout;

  private final BroadcastReceiver usbPermissionReceiver = new BroadcastReceiver() {
    @Override public void onReceive(Context context, Intent intent) {
      if (!USB_PERMISSION_ACTION.equals(intent.getAction())) return;
      boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
      UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
      if (!granted || device == null) {
        postStatus(false, "", "USB permission was not granted.");
        return;
      }
      openUsbDevice(device);
    }
  };

  @Override public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    requestWindowFeature(android.view.Window.FEATURE_NO_TITLE);
    getWindow().setFlags(android.view.WindowManager.LayoutParams.FLAG_FULLSCREEN, android.view.WindowManager.LayoutParams.FLAG_FULLSCREEN);
    usbManager = (UsbManager) getSystemService(Context.USB_SERVICE);
    locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
    registerUsbPermissionReceiver();

    web = new WebView(this);
    CookieManager cookieManager = CookieManager.getInstance();
    cookieManager.setAcceptCookie(true);
    if (Build.VERSION.SDK_INT >= 21) cookieManager.setAcceptThirdPartyCookies(web, true);
    web.setBackgroundColor(0xFF101A1D);
    web.getSettings().setJavaScriptEnabled(true);
    web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setGeolocationEnabled(true);
    web.getSettings().setAllowFileAccess(false);
    web.getSettings().setAllowContentAccess(false);
    assetLoader = new WebViewAssetLoader.Builder().addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
    web.setWebViewClient(new WebViewClient() {
      @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        return assetLoader.shouldInterceptRequest(request.getUrl());
      }
      @Override public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        if (!webBridgeSupported) view.evaluateJavascript("window.dispatchEvent(new CustomEvent('rootrise:native-unavailable'))", null);
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (!request.isForMainFrame()) return false;
        if ("https".equalsIgnoreCase(uri.getScheme()) && "appassets.androidplatform.net".equalsIgnoreCase(uri.getHost())) return false;
        String host = uri.getHost() == null ? "" : uri.getHost();
        boolean mapLink = "maps.google.com".equalsIgnoreCase(host) || "geo".equalsIgnoreCase(uri.getScheme());
        if (mapLink || "http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme())) {
          try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (ActivityNotFoundException ignored) {}
          return true;
        }
        return true;
      }
    });
    web.setWebChromeClient(new WebChromeClient() {
      @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
        if (origin == null || !"https://appassets.androidplatform.net".equals(origin)) { callback.invoke(origin, false, false); return; }
        if (hasLocationPermission()) { callback.invoke(origin, true, false); return; }
        if (geolocationCallback != null) geolocationCallback.invoke(geolocationOrigin, false, false);
        geolocationOrigin = origin;
        geolocationCallback = callback;
        requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, GEOLOCATION_REQUEST_CODE);
      }
    });
    setContentView(web);
    if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      WebViewCompat.addWebMessageListener(web, "RootRiseNative", Collections.singleton("https://appassets.androidplatform.net"), new WebViewCompat.WebMessageListener() {
        @Override public void onPostMessage(WebView view, WebMessageCompat message, Uri sourceOrigin, boolean isMainFrame, JavaScriptReplyProxy replyProxy) {
          if (isMainFrame && "https://appassets.androidplatform.net".equals(sourceOrigin.toString())) handleBridgeMessage(message.getData());
        }
      });
      webBridgeSupported = true;
    }
    web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
  }

  private void handleBridgeMessage(String raw) {
    try {
      JSONObject message = new JSONObject(raw);
      String action = message.optString("action", "");
      if ("connectBluetooth".equals(action)) runOnUiThread(() -> withBluetoothPermissions(false, this::showBluetoothModePicker));
      else if ("connectUsbSerial".equals(action)) runOnUiThread(this::showUsbDevices);
      else if ("send".equals(action)) sendNative(message.optString("data", ""));
      else if ("disconnect".equals(action)) disconnectNative("Disconnected by user.");
      else if ("getPhoneLocation".equals(action)) runOnUiThread(this::requestPhoneLocation);
    } catch (Exception error) { postStatus(false, "", "Invalid app connection request."); }
  }
  private void showBluetoothModePicker() {
    String[] choices = {"Bluetooth Classic SPP (original ESP32 firmware)", "Bluetooth LE UART (BLE firmware)"};
    new AlertDialog.Builder(this).setTitle("Connect ESP32")
      .setItems(choices, (dialog, which) -> {
        if (which == 0) withBluetoothPermissions(false, this::showPairedClassicDevices);
        else withBluetoothPermissions(true, this::startBleScan);
      }).setNegativeButton("Cancel", null).show();
  }

  private void withBluetoothPermissions(boolean scanning, Runnable action) {
    List<String> needed = new ArrayList<>();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      if (checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) needed.add(Manifest.permission.BLUETOOTH_CONNECT);
      if (scanning && checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) needed.add(Manifest.permission.BLUETOOTH_SCAN);
    } else if (scanning && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
    }
    if (needed.isEmpty()) { action.run(); return; }
    pendingBluetoothAction = action;
    requestPermissions(needed.toArray(new String[0]), BLUETOOTH_PERMISSION_REQUEST_CODE);
  }

  private BluetoothAdapter getBluetoothAdapter() {
    BluetoothManager manager = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
    return manager == null ? null : manager.getAdapter();
  }

  private void showPairedClassicDevices() {
    BluetoothAdapter adapter = getBluetoothAdapter();
    if (adapter == null || !adapter.isEnabled()) {
      postStatus(false, "", "Turn on Bluetooth, then connect again.");
      return;
    }
    try {
      List<BluetoothDevice> devices = new ArrayList<>(adapter.getBondedDevices());
      if (devices.isEmpty()) {
        new AlertDialog.Builder(this).setTitle("No paired ESP32")
          .setMessage("Pair RootRise-ESP32 in Android Bluetooth settings, then return here and connect again.")
          .setPositiveButton("Bluetooth settings", (dialog, which) -> startActivity(new Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS)))
          .setNegativeButton("Cancel", null).show();
        return;
      }
      String[] labels = new String[devices.size()];
      for (int i = 0; i < devices.size(); i++) {
        BluetoothDevice device = devices.get(i);
        String name = device.getName();
        labels[i] = (name == null || name.isEmpty() ? "Bluetooth device" : name) + " · " + device.getAddress();
      }
      new AlertDialog.Builder(this).setTitle("Choose paired ESP32")
        .setItems(labels, (dialog, which) -> connectClassic(devices.get(which)))
        .setNegativeButton("Cancel", null).show();
    } catch (SecurityException error) { postStatus(false, "", "Bluetooth permission is required to list paired devices."); }
  }

  private void connectClassic(BluetoothDevice device) {
    disconnectNative(null);
    manuallyDisconnecting = false;
    classicDevice = device;
    classicReconnectAttempts = 0;
    connectClassicAttempt(device, 0);
  }

  private void connectClassicAttempt(BluetoothDevice device, int attempt) {
    if (manuallyDisconnecting) return;
    postStatus(false, "", attempt == 0 ? "Connecting to " + safeDeviceName(device) + "…" : "Reconnecting to ESP32 (" + attempt + "/5)…");
    ioExecutor.execute(() -> {
      BluetoothSocket socket = null;
      try {
        BluetoothAdapter adapter = getBluetoothAdapter();
        if (adapter != null) adapter.cancelDiscovery();
        try {
          socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
          socket.connect();
        } catch (Exception secureError) {
          closeQuietly(socket);
          socket = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
          try { socket.connect(); }
          catch (Exception insecureError) { insecureError.addSuppressed(secureError); throw insecureError; }
        }
        if (manuallyDisconnecting) { closeQuietly(socket); return; }
        bluetoothSocket = socket;
        activeTransport = "android-spp";
        postStatus(true, activeTransport, safeDeviceName(device));
        BluetoothSocket connectedSocket = socket;
        mainHandler.postDelayed(() -> { if (bluetoothSocket == connectedSocket && connectedSocket.isConnected()) classicReconnectAttempts = 0; }, 30000);
        readBluetoothSocket(socket, device);
      } catch (Exception error) {
        closeQuietly(socket);
        if (!manuallyDisconnecting) scheduleClassicReconnect(device, "SPP connection failed: " + error.getMessage());
      }
    });
  }

  private void scheduleClassicReconnect(BluetoothDevice device, String reason) {
    if (manuallyDisconnecting || device == null) return;
    final long[] delays = {1000, 2000, 4000, 8000, 15000};
    if (classicReconnectAttempts >= delays.length) {
      postStatus(false, "", reason + " Automatic reconnect stopped after 5 attempts; reconnect manually.");
      return;
    }
    int attempt = ++classicReconnectAttempts;
    postStatus(false, "", reason + " Retrying in " + (delays[attempt - 1] / 1000) + "s (" + attempt + "/5).");
    classicReconnectRunnable = () -> { classicReconnectRunnable = null; if (!manuallyDisconnecting && activeTransport.isEmpty()) connectClassicAttempt(device, attempt); };
    mainHandler.postDelayed(classicReconnectRunnable, delays[attempt - 1]);
  }

  private String safeDeviceName(BluetoothDevice device) {
    try { String name = device.getName(); return name == null || name.isEmpty() ? "ESP32" : name; }
    catch (SecurityException error) { return "ESP32"; }
  }

  private void readBluetoothSocket(BluetoothSocket socket, BluetoothDevice device) {
    byte[] buffer = new byte[512];
    try {
      InputStream input = socket.getInputStream();
      int count;
      while (!manuallyDisconnecting && socket.isConnected() && (count = input.read(buffer)) >= 0) {
        if (count > 0) postData(new String(buffer, 0, count, java.nio.charset.StandardCharsets.UTF_8));
      }
    } catch (Exception error) {
      if (!manuallyDisconnecting) postStatus(false, "", "Bluetooth link lost: " + error.getMessage());
    } finally {
      closeQuietly(socket);
      if (bluetoothSocket == socket) bluetoothSocket = null;
      if (!manuallyDisconnecting && "android-spp".equals(activeTransport)) { activeTransport = ""; scheduleClassicReconnect(device, "Bluetooth disconnected."); }
    }
  }

  private void startBleScan() {
    BluetoothAdapter adapter = getBluetoothAdapter();
    if (adapter == null || !adapter.isEnabled() || adapter.getBluetoothLeScanner() == null) {
      postStatus(false, "", "Bluetooth LE is unavailable or turned off."); return;
    }
    disconnectNative(null);
    manuallyDisconnecting = false;
    bleScanner = adapter.getBluetoothLeScanner();
    postStatus(false, "", "Searching for RootRise BLE UART…");
    bleScanCallback = new ScanCallback() {
      @Override public void onScanResult(int callbackType, ScanResult result) {
        BluetoothDevice device = result.getDevice();
        String name = "";
        try { name = device.getName(); } catch (SecurityException ignored) {}
        boolean serviceFound = result.getScanRecord() != null && result.getScanRecord().getServiceUuids() != null
            && result.getScanRecord().getServiceUuids().contains(new ParcelUuid(BLE_SERVICE));
        if (serviceFound || (name != null && (name.toLowerCase(java.util.Locale.ROOT).contains("rootrise") || name.toLowerCase(java.util.Locale.ROOT).contains("esp32")))) {
          stopBleScan();
          connectBleGatt(device);
        }
      }
      @Override public void onScanFailed(int errorCode) { postStatus(false, "", "BLE scan failed (" + errorCode + ")."); }
    };
    try {
      bleScanner.startScan(null, new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), bleScanCallback);
      mainHandler.postDelayed(() -> {
        if (bleScanCallback != null) { stopBleScan(); postStatus(false, "", "No RootRise BLE device found. Check power and BLE firmware."); }
      }, 12000);
    } catch (SecurityException error) { postStatus(false, "", "Bluetooth scan permission is required."); }
  }

  private void stopBleScan() {
    if (bleScanner != null && bleScanCallback != null) {
      try { bleScanner.stopScan(bleScanCallback); } catch (SecurityException ignored) {}
    }
    bleScanCallback = null;
  }

  private void connectBleGatt(BluetoothDevice device) {
    try {
      postStatus(false, "", "Connecting to BLE device…");
      bluetoothGatt = device.connectGatt(this, false, new BluetoothGattCallback() {
        @Override public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
          if (status == BluetoothGatt.GATT_SUCCESS && newState == BluetoothProfile.STATE_CONNECTED) {
            gatt.discoverServices();
          } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
            if (bluetoothGatt == gatt) bluetoothGatt = null;
            bleWriteCharacteristic = null;
            gatt.close();
            if (!manuallyDisconnecting) { activeTransport = ""; postStatus(false, "", "Bluetooth LE disconnected."); }
          }
        }
        @Override public void onServicesDiscovered(BluetoothGatt gatt, int status) {
          if (status != BluetoothGatt.GATT_SUCCESS) { postStatus(false, "", "Could not discover BLE services."); return; }
          android.bluetooth.BluetoothGattService service = gatt.getService(BLE_SERVICE);
          if (service == null) { postStatus(false, "", "This device does not expose the RootRise BLE UART service."); gatt.disconnect(); return; }
          bleWriteCharacteristic = service.getCharacteristic(BLE_RX);
          BluetoothGattCharacteristic notify = service.getCharacteristic(BLE_TX);
          if (bleWriteCharacteristic == null || notify == null) { postStatus(false, "", "RootRise BLE UART characteristics are missing."); gatt.disconnect(); return; }
          if (!gatt.setCharacteristicNotification(notify, true)) {
            postStatus(false, "", "Android could not subscribe to BLE sensor notifications."); gatt.disconnect(); return;
          }
          BluetoothGattDescriptor descriptor = notify.getDescriptor(CCCD);
          if (descriptor == null) {
            postStatus(false, "", "BLE UART TX is missing its notification descriptor (CCCD)."); gatt.disconnect(); return;
          }
          descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
          if (!gatt.writeDescriptor(descriptor)) {
            postStatus(false, "", "Could not enable BLE notifications."); gatt.disconnect();
          }
        }
        @Override public void onDescriptorWrite(BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
          if (CCCD.equals(descriptor.getUuid())) {
            if (status == BluetoothGatt.GATT_SUCCESS) activateBle(device);
            else postStatus(false, "", "Could not subscribe to BLE sensor notifications.");
          }
        }
        @Override public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
          byte[] value = characteristic.getValue();
          if (value != null) postData(new String(value, java.nio.charset.StandardCharsets.UTF_8));
        }
        @Override public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value) {
          if (value != null) postData(new String(value, java.nio.charset.StandardCharsets.UTF_8));
        }
      });
    } catch (SecurityException error) { postStatus(false, "", "Bluetooth connect permission is required."); }
  }

  private void activateBle(BluetoothDevice device) {
    activeTransport = "android-ble";
    postStatus(true, activeTransport, safeDeviceName(device));
  }
  private void showUsbDevices() {
    List<UsbSerialDriver> drivers = UsbSerialProber.getDefaultProber().findAllDrivers(usbManager);
    if (drivers.isEmpty()) { postStatus(false, "", "No supported USB serial adapter found. Connect the ESP32 with an OTG adapter."); return; }
    String[] labels = new String[drivers.size()];
    for (int i = 0; i < drivers.size(); i++) {
      UsbDevice device = drivers.get(i).getDevice();
      labels[i] = "USB device " + device.getDeviceName() + " (" + String.format("%04X:%04X", device.getVendorId(), device.getProductId()) + ")";
    }
    new AlertDialog.Builder(this).setTitle("Choose USB serial device")
      .setItems(labels, (dialog, which) -> requestUsbPermission(drivers.get(which).getDevice()))
      .setNegativeButton("Cancel", null).show();
  }

  private void requestUsbPermission(UsbDevice device) {
    if (usbManager.hasPermission(device)) { openUsbDevice(device); return; }
    pendingUsbDevice = device;
    Intent intent = new Intent(USB_PERMISSION_ACTION).setPackage(getPackageName());
    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
    PendingIntent permissionIntent = PendingIntent.getBroadcast(this, 0, intent, flags);
    usbManager.requestPermission(device, permissionIntent);
  }

  private void openUsbDevice(UsbDevice device) {
    for (UsbSerialDriver driver : UsbSerialProber.getDefaultProber().findAllDrivers(usbManager)) {
      if (!driver.getDevice().equals(device)) continue;
      try {
        UsbDeviceConnection connection = usbManager.openDevice(device);
        if (connection == null) { postStatus(false, "", "Android could not open the USB device."); return; }
        UsbSerialPort port = driver.getPorts().get(0);
        port.open(connection);
        port.setParameters(115200, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE);
        usbConnection = connection;
        usbPort = port;
        activeTransport = "android-usb";
        usbIoManager = new SerialInputOutputManager(port, new SerialInputOutputManager.Listener() {
          @Override public void onNewData(byte[] data) { postData(new String(data, java.nio.charset.StandardCharsets.UTF_8)); }
          @Override public void onRunError(Exception error) { if (!manuallyDisconnecting) postStatus(false, "", "USB serial stopped: " + error.getMessage()); }
        });
        usbIoManager.start();
        postStatus(true, activeTransport, "USB Serial");
        return;
      } catch (Exception error) { postStatus(false, "", "USB serial connection failed: " + error.getMessage()); closeUsb(); return; }
    }
    postStatus(false, "", "The USB serial device disappeared. Reconnect it and try again.");
  }

  private boolean sendNative(String text) {
    if (activeTransport.isEmpty()) { postStatus(false, "", "Connect the ESP32 before sending commands."); return false; }
    byte[] bytes = text.getBytes(java.nio.charset.StandardCharsets.UTF_8);
    try {
      if ("android-spp".equals(activeTransport) && bluetoothSocket != null) {
        OutputStream output = bluetoothSocket.getOutputStream();
        synchronized (output) { output.write(bytes); output.flush(); }
        return true;
      }
      if ("android-usb".equals(activeTransport) && usbPort != null) { usbPort.write(bytes, 1000); return true; }
      if ("android-ble".equals(activeTransport) && bluetoothGatt != null && bleWriteCharacteristic != null) {
        int properties = bleWriteCharacteristic.getProperties();
        if ((properties & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) {
          bleWriteCharacteristic.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
        } else if ((properties & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0) {
          bleWriteCharacteristic.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
        } else {
          postStatus(true, activeTransport, "BLE UART RX does not allow writes."); return false;
        }
        bleWriteCharacteristic.setValue(bytes);
        boolean accepted = bluetoothGatt.writeCharacteristic(bleWriteCharacteristic);
        if (!accepted) postStatus(true, activeTransport, "ESP32 rejected the Bluetooth command write.");
        return accepted;
      }
    } catch (Exception error) { postStatus(false, "", "Command send failed: " + error.getMessage()); return false; }
    return false;
  }

  private void disconnectNative(String message) {
    manuallyDisconnecting = true;
    stopBleScan();
    activeTransport = "";
    bleWriteCharacteristic = null;
    BluetoothSocket socket = bluetoothSocket; bluetoothSocket = null; closeQuietly(socket);
    BluetoothGatt gatt = bluetoothGatt; bluetoothGatt = null;
    if (gatt != null) { try { gatt.disconnect(); gatt.close(); } catch (Exception ignored) {} }
    closeUsb();
    if (message != null) postStatus(false, "", message);
  }

  private void closeUsb() {
    if (usbIoManager != null) { try { usbIoManager.stop(); } catch (Exception ignored) {} usbIoManager = null; }
    if (usbPort != null) { try { usbPort.close(); } catch (Exception ignored) {} usbPort = null; }
    if (usbConnection != null) { try { usbConnection.close(); } catch (Exception ignored) {} usbConnection = null; }
  }

  private void postData(String text) {
    if (web == null) return;
    String quoted = JSONObject.quote(text);
    runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('rootrise:native-data',{detail:" + quoted + "}))", null); });
  }

  private void postStatus(boolean connected, String transport, String message) {
    if (web == null) return;
    String json = "{connected:" + connected + ",transport:" + JSONObject.quote(transport) + ",message:" + JSONObject.quote(message == null ? "" : message) + "}";
    runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('rootrise:native-status',{detail:" + json + "}))", null); });
  }

  private void closeQuietly(BluetoothSocket socket) {
    if (socket == null) return;
    try { socket.close(); } catch (Exception ignored) {}
  }
  private void registerUsbPermissionReceiver() {
    IntentFilter filter = new IntentFilter(USB_PERMISSION_ACTION);
    if (Build.VERSION.SDK_INT >= 33) registerReceiver(usbPermissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
    else registerReceiver(usbPermissionReceiver, filter);
    usbReceiverRegistered = true;
  }

  private boolean hasLocationPermission() {
    return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
  }

  private void requestPhoneLocation() {
    if (!hasLocationPermission()) {
      requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, PHONE_LOCATION_PERMISSION_REQUEST_CODE);
      return;
    }
    if (locationManager == null) { postLocationError("Location service is unavailable on this phone."); return; }
    try {
      Location best = null;
      for (String provider : locationManager.getProviders(true)) {
        Location known = locationManager.getLastKnownLocation(provider);
        if (known != null && (best == null || known.getTime() > best.getTime())) best = known;
      }
      final boolean[] receivedFix = {best != null};
      if (best != null) postPhoneLocation(best);
      stopLocationUpdates();
      locationListener = new LocationListener() {
        @Override public void onLocationChanged(Location location) { receivedFix[0] = true; postPhoneLocation(location); stopLocationUpdates(); }
        @Override public void onProviderDisabled(String provider) {}
        @Override public void onProviderEnabled(String provider) {}
        @Deprecated @Override public void onStatusChanged(String provider, int status, android.os.Bundle extras) {}
      };
      boolean requested = false;
      for (String provider : locationManager.getProviders(true)) {
        locationManager.requestLocationUpdates(provider, 0L, 0f, locationListener, Looper.getMainLooper());
        requested = true;
      }
      if (!requested && !receivedFix[0]) { stopLocationUpdates(); postLocationError("Turn on Location in Android settings and try again."); return; }
      locationTimeout = () -> { stopLocationUpdates(); if (!receivedFix[0]) postLocationError("Could not get a GPS fix. Move near a window or outdoors and try again."); };
      mainHandler.postDelayed(locationTimeout, 20000L);
    } catch (SecurityException error) {
      postLocationError("Allow location access for RootRise in Android app settings.");
    } catch (Exception error) {
      postLocationError("Could not read this phone's location. Check that Location is turned on.");
    }
  }

  private void postPhoneLocation(Location location) {
    if (location == null || web == null) return;
    String detail = "{latitude:" + location.getLatitude() + ",longitude:" + location.getLongitude() + ",accuracy:" + location.getAccuracy() + "}";
    runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('rootrise:native-location',{detail:" + detail + "}))", null); });
  }

  private void postLocationError(String message) {
    String detail = JSONObject.quote(message);
    runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('rootrise:native-location-error',{detail:" + detail + "}))", null); });
  }

  private void stopLocationUpdates() {
    if (locationTimeout != null) { mainHandler.removeCallbacks(locationTimeout); locationTimeout = null; }
    if (locationManager != null && locationListener != null) {
      try { locationManager.removeUpdates(locationListener); } catch (SecurityException ignored) {}
      locationListener = null;
    }
  }
  @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode == GEOLOCATION_REQUEST_CODE && geolocationCallback != null) {
      geolocationCallback.invoke(geolocationOrigin, hasLocationPermission(), false);
      geolocationCallback = null; geolocationOrigin = null;
    } else if (requestCode == PHONE_LOCATION_PERMISSION_REQUEST_CODE) {
      if (hasLocationPermission()) requestPhoneLocation();
      else postLocationError("Location permission was denied. Allow it in Android app settings and try again.");
    } else if (requestCode == BLUETOOTH_PERMISSION_REQUEST_CODE) {
      boolean granted = true;
      for (String permission : permissions) if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) granted = false;
      Runnable action = pendingBluetoothAction; pendingBluetoothAction = null;
      if (granted && action != null) action.run();
      else postStatus(false, "", "Bluetooth permission was denied.");
    }
  }

  @Override protected void onDestroy() {
    stopLocationUpdates();
    disconnectNative(null);
    if (usbReceiverRegistered) { try { unregisterReceiver(usbPermissionReceiver); } catch (Exception ignored) {} }
    if (web != null) { if (webBridgeSupported) WebViewCompat.removeWebMessageListener(web, "RootRiseNative"); web.destroy(); web = null; }
    ioExecutor.shutdownNow();
    super.onDestroy();
  }
}









