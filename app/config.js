var config = module.exports,
    fs = require('fs'),
    Q = require('q');

// Unused.
var PRODUCTION = process.env.NODE_ENV === "production";

config.designersjson = __dirname + "/data/designers.json";
config.instagramclientid = "efacd9d0e5844e73bb75f3f2b0ddf675";

config.express = {
      port: process.env.PORT || 5000,
      ip: "127.0.0.1"
};

config.mongodb = process.env.MONGOLAB_URI ||
                 process.env.MONGOHQ_URL ||
                 'mongodb://127.0.0.1:27017/ifs2014';

config.getdesigners = function(){

    var deferred = Q.defer();

    // Get designers file on startup.
    var file = config.designersjson;
    fs.readFile(file, 'utf8', function (err, data) {
        if (err) {
            deferred.reject('Error: ' + err);
            return;
        }
        deferred.resolve(JSON.parse(data));
    });

    return deferred.promise;
};

