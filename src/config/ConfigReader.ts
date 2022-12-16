var path = require("path");
var jsonFile = require("jsonfile");
var fileName = path.join(__dirname, "user.json");
export default class ConfigReader {
  static readUser() {
    return new Promise(rsv => {
      jsonFile.readFile(fileName, function(err, jsonData) {
        if (err) throw err;
        rsv(jsonData);
      });
    });
  }
}
