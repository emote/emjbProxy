"use strict";

var emproxy = require('emproxy');
var http = require('emsoap').subsystems.httpRequest;
var emutils = require('emutils');

var typeDefs = {}

var opUrls =
{
    "DELETE" : "Delete",
    "INSERT" : "Insert",
    "INVOKE" : "Invoke",
    "SELECT" : "Select",
    "UPDATE" : "Update"
};

emproxy.init(function afterInitCallback(initialConfig) {
    setInitialConfig(initialConfig);
    emproxy.start(processDirective);
});

function setInitialConfig(proxyConfig) {
    typeDefs = proxyConfig.typeDefs;
    console.log(proxyConfig);
}

function processDirective(restRequest,callback) {
    var typeDef = typeDefs[restRequest.targetType];
    if (!typeDef || !typeDef.baseUrl) {
        return callback(new Error("Unsupported datatype: " + restRequest.targetType));
    }
    if (!typeDef.operations[restRequest.op]) {
        return callback(new Error("Unsupported operation: " + restRequest.targetType + "." + restRequest.op));
    }

    var url = typeDef.baseUrl;
    if (url.charAt(url.length-1) != '/') {
        url += '/';
    }
    url += opUrls[restRequest.op];
    if (restRequest.op == "INVOKE") {
        url += '/' + restRequest.name;
    }

    callJitterbit(url, restRequest, callback);
}

function callJitterbit(url, restRequest, cb) {
    var httpOptions = http.parseUrl(url);
    httpOptions.headers = {"content-type" : "application/json"};
    var creds = restRequest.options ? restRequest.options.credentials : null;
    if (creds && creds.username) {
        httpOptions.auth = creds.username + ":" + creds.password;
    }
    httpOptions.method = "POST";
    http.httpRequest(httpOptions, JSON.stringify(restRequest, null, 2), function(err, result) {
        if (err) {
            return cb(err);
        }
        else {
            try {
                return cb(null, JSON.parse(result.body));
            }
            catch (ex) {
                return cb(ex);
            }
        }
    });
}