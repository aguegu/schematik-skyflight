/*
 * Schematik Skyflight — MPU6050 USB tilt controller
 * Photo wiring: SDA=D8/GPIO19 (yellow), SCL=D7/GPIO17 (orange).
 * Also detects XIAO D4/D5 (22/23), D6/D7 (16/17), or generic C6 6/7.
 * VCC=3.3V, AD0=GND (0x68). Retries detection while unplugged.
 * Uno / classic Nano: SDA=A4, SCL=A5. See README for voltage safety.
 * Uses only Wire. Serial: 115200 baud, newline-delimited roll,pitch in degrees.
 * Keep still for ~2 seconds at boot. In the game, C re-centers your grip.
 * No yaw integration: MPU6050 yaw drifts without an external reference.
 */
#include <Wire.h>
#include <math.h>

uint8_t address = 0x68;
float biasX = 0, biasY = 0;
float roll = 0, pitch = 0;
uint32_t lastUpdate = 0, lastOutput = 0, lastError = 0;
const float DEG_PER_RAD = 57.2957795f;

bool writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(address);
  Wire.write(reg); Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool readRegisters(uint8_t reg, uint8_t *data, uint8_t count) {
  Wire.beginTransmission(address); Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  const uint8_t got = Wire.requestFrom(address, count, (uint8_t)true);
  if (got != count) {
    while (Wire.available()) Wire.read();
    return false;
  }
  for (uint8_t i = 0; i < count; i++) data[i] = Wire.read();
  return true;
}

bool probeSensor() {
  for (uint8_t candidate = 0x68; candidate <= 0x69; candidate++) {
    address = candidate;
    uint8_t id = 0;
    if (readRegisters(0x75, &id, 1) && (id & 0x7E) == 0x68) return true;
  }
  return false;
}

bool findSensorBus() {
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  // Only these documented I2C pairs are tried, never arbitrary GPIOs.
  const uint8_t pairs[][2] = {{19, 17}, {22, 23}, {16, 17}, {6, 7}};
  for (uint8_t i = 0; i < sizeof(pairs) / sizeof(pairs[0]); i++) {
    Wire.begin(pairs[i][0], pairs[i][1]);
    Wire.setClock(100000);
    Wire.setTimeOut(25);
    if (probeSensor()) {
      Serial.print(F("# MPU6050 detected: SDA=GPIO")); Serial.print(pairs[i][0]);
      Serial.print(F(" SCL=GPIO")); Serial.print(pairs[i][1]);
      Serial.print(F(" address=0x")); Serial.println(address, HEX);
      return true;
    }
    Wire.end();
  }
  return false;
#else
  Wire.begin();
#if defined(ARDUINO_ARCH_AVR)
  // Disable the AVR's internal 5V pull-ups. Use external pull-ups/level shifting.
  digitalWrite(SDA, LOW); digitalWrite(SCL, LOW);
#endif
  Wire.setClock(100000);
#if defined(WIRE_HAS_TIMEOUT)
  Wire.setWireTimeout(3000, true);
#endif
  return probeSensor();
#endif
}

int16_t signedWord(const uint8_t *data) {
  return (int16_t)(((uint16_t)data[0] << 8) | data[1]);
}

bool readMotion(float &ax, float &ay, float &az, float &gx, float &gy) {
  uint8_t data[14];
  if (!readRegisters(0x3B, data, sizeof(data))) return false;
  ax = signedWord(data); ay = signedWord(data + 2); az = signedWord(data + 4);
  gx = signedWord(data + 8) / 131.0f;
  gy = signedWord(data + 10) / 131.0f;
  // A disconnected/stuck I2C bus must not look like a valid neutral controller.
  return (fabs(ax) + fabs(ay) + fabs(az)) > 100.0f;
}

void fatal(const __FlashStringHelper *message) {
  while (true) {
    Serial.print(F("# ERROR ")); Serial.println(message);
    delay(1000);
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  while (!findSensorBus()) {
    Serial.println(F("# ERROR MPU6050 not found. Reconnect 3.3V/GND/SDA/SCL; retrying in 2 seconds."));
    delay(2000);
  }
  if (!writeRegister(0x6B, 0x01) || // wake up, PLL clock
      !writeRegister(0x1A, 0x03) || // ~44 Hz digital low-pass filter
      !writeRegister(0x19, 0x09) || // 100 Hz sample rate
      !writeRegister(0x1B, 0x00) || // gyro +/-250 degrees/sec
      !writeRegister(0x1C, 0x00))   // accelerometer +/-2g
    fatal(F("MPU6050 configuration failed. Check wiring; reset to retry."));
  delay(100);
  Serial.println(F("# SCHEMATIK SKYFLIGHT: keep sensor still for 2 seconds"));
  float ax = 0, ay = 0, az = 0, gx = 0, gy = 0;
  const uint16_t samples = 200;
  for (uint16_t i = 0; i < samples; i++) {
    if (!readMotion(ax, ay, az, gx, gy)) fatal(F("MPU6050 read failed during calibration. Reset to retry."));
    biasX += gx; biasY += gy;
    delay(10);
  }
  biasX /= samples; biasY /= samples;
  roll = atan2(ay, az) * DEG_PER_RAD;
  pitch = atan2(-ax, sqrt(ay * ay + az * az)) * DEG_PER_RAD;
  lastUpdate = micros(); lastOutput = millis();
  Serial.println(F("# READY: roll,pitch (degrees), 50 Hz"));
}

void loop() {
  const uint32_t now = micros();
  const uint32_t elapsed = now - lastUpdate; // unsigned subtraction survives wraparound
  if (elapsed < 10000) return;
  lastUpdate = now;
  float dt = elapsed * 0.000001f;
  if (dt > 0.05f) dt = 0.05f;
  float ax, ay, az, gx, gy;
  if (!readMotion(ax, ay, az, gx, gy)) {
    if (millis() - lastError >= 1000) {
      Serial.println(F("# ERROR MPU6050 read failed. Check I2C wiring."));
      lastError = millis();
    }
    return;
  }
  const float accelRoll = atan2(ay, az) * DEG_PER_RAD;
  const float accelPitch = atan2(-ax, sqrt(ay * ay + az * az)) * DEG_PER_RAD;
  const float alpha = 0.45f / (0.45f + dt);
  if (fabs(accelRoll - roll) > 180) roll = accelRoll;
  else roll = alpha * (roll + (gx - biasX) * dt) + (1 - alpha) * accelRoll;
  pitch = alpha * (pitch + (gy - biasY) * dt) + (1 - alpha) * accelPitch;
  if (millis() - lastOutput >= 20) {
    lastOutput = millis();
    Serial.print(roll, 2); Serial.print(','); Serial.println(pitch, 2);
  }
}
