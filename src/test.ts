import har2raml = require("./index")
import path = require("path")
/**
 * Utilize the "../harLogs/Parse/HAR" directory to generate API
 */
var logsDir = path.resolve(__dirname,"../harLogs/Parse/HAR");
var api = har2raml.launch(logsDir,"https://api.parse.com/1");

var apiDir = path.resolve(__dirname,"../harLogs/Parse/API");
har2raml.serialize(api,apiDir);