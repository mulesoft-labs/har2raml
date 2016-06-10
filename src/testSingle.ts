import har2raml = require("./index")
import path = require("path")

var logsDir = path.resolve(__dirname,"../harLogs/Parse/HAR/users.har");
var api = har2raml.launch(logsDir,"https://api.parse.com/1");

var apiDir = path.resolve(__dirname,"../harLogs/Parse/API2");
har2raml.serialize(api,apiDir);