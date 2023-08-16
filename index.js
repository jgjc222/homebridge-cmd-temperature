var Service, Characteristic;

const CELSIUS_UNITS = 'C',
      FAHRENHEIT_UNITS = 'F';
const DEF_MIN_TEMPERATURE = -100,
      DEF_MAX_TEMPERATURE = 130,
      DEF_UNITS = CELSIUS_UNITS,
      DEF_TIMEOUT = 5000,
      DEF_INTERVAL = 120000; //120s

const { exec } = require("child_process");
const fs = require("fs");

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
   this.exec = exec;
   this.cmd = config["cmd"];
   this.fs = fs;
   this.path = "/var/lib/homebridge/aux/";

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
   updateState: function () {
         var self = this;
      //Ensure previous call finished
      if (this.waiting_response) {
         return;
      }
      this.waiting_response = true;
      this.last_value = new Promise((resolve, reject) => {
      this.exec(this.cmd, function (error, stdout, stderr) {
            if (stderr) {
                  self.log('Failed to get value');
                  reject(stderr);
            } else {
self.fs.appendFile(self.path+self.name, stdout, function (err) {
  if (err) throw err;
});


            
                  resolve(stdout);
    }
            });
            this.log("tail -n 20 "+self.path+self.name+" > "+self.path+self.name);
            this.exec("tail -n 20 "+self.path+self.name+" > "+self.path+self.name);
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
