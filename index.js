var Service, Characteristic;

const CELSIUS_UNITS = 'C',
      FAHRENHEIT_UNITS = 'F';
const DEF_MIN_TEMPERATURE = -100,
      DEF_MAX_TEMPERATURE = 130,
      DEF_UNITS = CELSIUS_UNITS,
      DEF_TIMEOUT = 5000,
      DEF_INTERVAL = 120000; //120s

const { exec } = require("child_process");
const ExecQueue = require('./ExecQueue');
const execQueue = new ExecQueue();

module.exports = function (homebridge) {
   Service = homebridge.hap.Service;
   Characteristic = homebridge.hap.Characteristic;
   homebridge.registerAccessory("homebridge-cmd-temperature", "CmdTemperature", CmdTemperature);
}


function CmdTemperature(log, config) {
   this.log = log;

   this.name = config.name;
   this.manufacturer = config["manufacturer"] || "Unavailable";
   this.model = config["model"] || "Unavailable";
   this.serial = config["serial"] || "Unavailable";
   this.fieldName = ( config["field_name"] != null ? config["field_name"] : "temperature" );
   this.minTemperature = config["min_temp"] || DEF_MIN_TEMPERATURE;
   this.maxTemperature = config["max_temp"] || DEF_MAX_TEMPERATURE;
   this.units = config["units"] || DEF_UNITS;
   this.update_interval = Number( config["update_interval"] || DEF_INTERVAL );
   this.debug = config["debug"] || false;
   this.exec = function() {execQueue.add.apply(execQueue, arguments)}

   //Check if units field is valid
   this.units = this.units.toUpperCase()
   if (this.units !== CELSIUS_UNITS && this.units !== FAHRENHEIT_UNITS) {
      this.log('Bad temperature units : "' + this.units + '" (assuming Celsius)');
      this.units = CELSIUS_UNITS;
   }

   // Internal variables
   this.last_value = null;
   this.waiting_response = false;
}

CmdTemperature.prototype = {

   logDebug: function (str) {
      if (this.debug) {
         this.log(str)
      }
   },

   updateState: function () {
      //Ensure previous call finished
      if (this.waiting_response) {
         this.log('Avoid updateState as previous response does not arrived yet');
         return;
      }
      this.waiting_response = true;
      cmd = "/home/jgjc/.local/bin/remo device get --token lDPCKK_hYfaSK34Av0NGIFAjfW8Fb_fd23g29anwJ2g.F884BI3bKFfvmzm3XeE_WYZaEEK-8Ld2qQTXAfcrWK8 | jq '.[0].newest_events.te.val"
      this.exec(cmd, function (error, stdout, stderr) {
            // Error detection
            if (error) {
                  this.log("Failed to");
                  this.log(stderr);
            } else {
                  this.last_value = stdout;
                  this.log(stdout);
            }
      });
      this.last_value.then((value) => {
         this.temperatureService
            .getCharacteristic(Characteristic.CurrentTemperature).updateValue(value);
         this.temperatureService
            .getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT);
         this.waiting_response = false;
      }).catch((error) => {
         this.temperatureService
            .getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT);
         this.log('Error updating state: ' + error.message);
         this.waiting_response = false;
      });
   },

   getState: function (callback) {
      this.log('Call to getState: waiting_response is');
      this.updateState(); //This sets the promise in last_value
      this.last_value.then((value) => {
         callback(null, value);
      }).catch((error) => {
         callback(error, null);
      });
   },

   getServices: function () {
      this.informationService = new Service.AccessoryInformation();
      this.informationService
      .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.SerialNumber, this.serial);

      this.temperatureService = new Service.TemperatureSensor(this.name);
      this.temperatureService
         .getCharacteristic(Characteristic.CurrentTemperature)
         .on('get', this.getState.bind(this))
         .setProps({
             minValue: this.minTemperature,
             maxValue: this.maxTemperature
         });

      if (this.update_interval > 0) {
         this.timer = setInterval(this.updateState.bind(this), this.update_interval);
      }

      return [this.informationService, this.temperatureService];
   },

   getFromObject: function (obj, path, def) {
      if (!path) return obj;

      const fullPath = path
        .replace(/\[/g, '.')
        .replace(/]/g, '')
        .split('.')
        .filter(Boolean);

      // Iterate all path elements to get the leaf, or untill the key is not found in the JSON
      return fullPath.every(everyFunc) ? obj : def;

      function everyFunc (step) {
        // Dynamically update the obj variable for the next call
        return !(step && (obj = obj[step]) === undefined);
      }
   }
};
