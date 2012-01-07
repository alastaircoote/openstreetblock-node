var osb = require("./openstreetblock.js");


// Load the http module to create an http server.
var http = require('http');

// Configure our HTTP server to respond with Hello World to all requests.
var server = http.createServer(function (request, response) {
  response.writeHead(200, {"Content-Type": "text/plain"});
  osb.options.connectionString = "postgres://user:pass@dbserver:5432/database";
 
 osb.doLookup(40.681356,-73.976746,function(data) { 
   	response.end(JSON.stringify(data));
  })
  
});

// Listen on port 8000, IP defaults to 127.0.0.1
server.listen(8003);