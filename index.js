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

var loginUrl;

var loginSucceededResponse = {
    status: "SUCCESS"
};


emproxy.init(function afterInitCallback(initialConfig) {
    setInitialConfig(initialConfig);
    emproxy.start(processDirective);
});

function setInitialConfig(proxyConfig) {
    if (proxyConfig.typeDefs) {
        typeDefs = proxyConfig.typeDefs;
    }
    for (var name in typeDefs) {
        loginUrl = typeDefs[name].baseUrl;
        if (loginUrl.charAt(loginUrl.length-1) != '/') {
            loginUrl += '/';
        }
        loginUrl += "Login";
        break;
    }
    console.log(proxyConfig);
}

function processDirective(restRequest,callback) {

    if(restRequest.op === 'INVOKE' && 
        restRequest.targetType === "CdmExternalCredentials" && 
        restRequest.name == "validate") {
        if (!loginUrl) {
            return callback(null, loginSucceededResponse);
        }
        return callJitterbit(loginUrl, restRequest, function(err, result, statusCode) {
            var msg;
            var code;
            var response;
            if (statusCode == 401 || statusCode == 403) {
                msg = "error logging into service";
                code = "integration.login.fail";
            }
            else if (err) {
                msg = "unable to contact service";
                code = "integration.login.fail.cannotContact";
            }

            if (msg) {
                response = emutils.generateCredentialsError(msg, code);
            }
            else {
                response = loginSucceededResponse;
            }
            callback(null, response);
        });
    }

    var options = restRequest.options;
    if(!(options && options.credentials)) {
        // An error on validate credentials returns a normal restResponse
        return callback(null,{
            targetType: 'RestResponse',
            status: 'ERROR',
            errors: [{
                targetType:'CdmError',
                code:'integration.login.fail.nocredentials',
                message:"No credentials have been entered"
            }]
        });
    }

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
        else if (result.status >= 400) {
            cb(new Error("Error status :" + result.statusCode + ". " + result.body), null, result.status);
        }
        else {
            try {
                var reply = JSON.parse(result.body);
                return cb(null, reply);
            }
            catch (ex) {
                var errReply = 
                    {
                        targetType: 'RestResponse',
                        status : "ERROR",
                        errors: [{
                            targetType:'CdmError',
                            code:'integration.unexpected.response',
                            message:"nexpected response: " + result.body
                        }]
                    };
                return cb(null, errReply);
            }
        }
    });
}
