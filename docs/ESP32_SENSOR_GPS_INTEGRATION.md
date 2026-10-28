# ESP32 Soil, Flow, and GPS Integration

This app reads measurements forwarded by the ESP32 connection. It cannot read sensors connected to the board directly from the browser. The current project package does not include an ESP32 sketch, so no GPIO assignments or sensor calibration values are assumed here.

## Soil moisture

Use a capacitive analog soil-moisture probe. Connect its analog output to a supported ESP32 ADC1 input and connect grounds together. Check the exact probe supply/output voltage and board pinout before wiring. Read the dry and wet raw values with your own soil and sensor, then map the calibrated range to 0–100%; do not use generic raw values as a calibration. The Arduino-ESP32 ADC API provides `analogRead` and calibrated millivolt readings: https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html.

Forward the calibrated percentage as DATA field 6:

```text
DATA,temp,humidity,pump,seconds,soil_percent
```

## Water used

An inline Hall-effect flow meter reports pulses as water moves. Install it in the irrigation line in the direction marked on the sensor, then count pulses and calibrate pulses per litre for the exact sensor and installation. A YF-S201 family datasheet describes a pulse output proportional to flow; exact calibration varies by variant and should be checked against the supplied datasheet and a measured volume: https://handsontec.com/dataspecs/sensor/Water%20Flow%20Sensor.pdf.

Some flow-meter variants powered at 5 V can output a signal above ESP32 GPIO logic levels. Check your sensor revision and use a suitable level shifter or divider if needed; never assume a 5 V pulse is safe for a 3.3 V input.

Forward the accumulated measured litres as DATA field 7:

```text
DATA,temp,humidity,pump,seconds,soil_percent,water_litres
```

Without a flow meter, software cannot know actual litres delivered. Pump runtime alone is not enough because flow changes with pressure and plumbing.

## GPS

The marking **GY-GPS6MU2** is commonly used for a u-blox NEO-6M breakout; check the chip label and board revision because clone breakouts vary. If the header is marked “UCC”, verify whether that is actually **VCC** before wiring. u-blox NEO-6 defaults to NMEA at 9600 baud, 8N1, and can output GGA, GLL, and RMC among other sentences: https://content.u-blox.com/sites/default/files/products/documents/NEO-6_DataSheet_%28GPS.G6-HW-09005%29.pdf.

Connect the GPS module's UART TX to an ESP32 UART RX pin, share ground, and match the UART baud rate. Check logic voltage before connecting. The ESP32 firmware must read the GPS UART (typically 9600 baud for NEO-6 defaults) and forward valid GGA, GLL, or RMC NMEA lines over the same USB/BLE transport used by this app, or convert a valid fix to one of these forms:

```text
$GNRMC,...
$GNGGA,...
GPS,latitude,longitude
LOCATION,latitude,longitude
```

Alternatively, add decimal latitude and longitude to DATA fields 8 and 9. A GPS module wired to the ESP32 but not read/forwarded by its firmware is invisible to the app.

## Complete app data line

```text
DATA,temp,humidity,pump,seconds,soil_percent,water_litres,latitude,longitude
```

End each line with a newline. `temp` and `humidity` are the existing air sensor readings; `pump` is 0/1; `seconds` is the reported run time. The app leaves missing or invalid measurements blank, enables automatic watering only when it receives a live soil percentage, and recognizes NMEA GGA/GLL/RMC fixes.

Before writing board-specific firmware, identify the ESP32 board revision, exact GPS/soil/flow sensor models, wiring pins, and current sketch. Do not connect an unknown sensor output to the board until its voltage is checked.
