var db = module.exports,
    Q = require('q'),
    config = require("./config");

var MongoClient = require('mongodb').MongoClient;

var collection = false,
    deferred = Q.defer();

db.collection = false;
db.connect = function(){

    if( db.connection ){
        return db.connection;
    }

    MongoClient.connect(config.mongodb, function(err, database) {
        if(err) throw err;

        database.collection("instagrams", function(err, res){
            db.collection = res;
            deferred.resolve( res );
        });

    });

    return deferred.promise;
}



