var instagram = module.exports,
    config = require("./config"),
    https = require('https'),
    cors = require('cors'),
    Q = require('q'),
    db = require("./db");

function storenew( designer, existing, fresh ){

    var deferred = Q.defer();

    var keylist = [
            "location",
            "tags",
            "created_time",
            "link",
            "images",
            "type",
            "id",
            "user",
            "country",
            "caption"
        ],
        toinsert = [],
        i;


    fresh = fresh.value;
    existing = existing.value;

    i = fresh.length;

    // Clean data of unwanted key:vals.
    while( i-- ){
        for(var key in fresh[i]){
            if( keylist.indexOf( key ) < 0 ){
                delete fresh[i][key]
            }
            // Convert time to integer.
            if( key === "created_time" ){
                fresh[i][key] = Number(fresh[i][key]);
            }
        }
        // Add ig_user_id here to makequerying eaiser.
        for(var key in designer ){
            fresh[i][key] = designer[key];
        }
        fresh[i].type = "instagram";
    }

    // Created array of items to insert.
    i = fresh.length;
    while( i-- ){
        if( ! existing.length || fresh[i].created_time > existing[0].created_time) {
            // console.log("insert", fresh[i].created_time);
            toinsert.push( fresh[i] );
        }
    };

    // Do the insert if there are any newies.
    if( toinsert.length > 0 ){
        // Insert all at once rather than one at a time.
        db.collection.insert( toinsert, {w:1}, function( err, res ){
            if( ! err ){
                deferred.resolve( toinsert.length );
            } else {
                deferred.reject(new Error(err));
            }
        });
    } else {
        setTimeout(function(){
            deferred.resolve(0);
        }, 1);
    }

    return deferred.promise;

}

function fetchlatest( userid ){

    var deferred = Q.defer();

    // Instagram API methods.
    var options = {
        host: 'api.instagram.com',
        port: 443,
        path: '/v1/users/{ig_user_id}/media/recent/?client_id=efacd9d0e5844e73bb75f3f2b0ddf675',
        method: 'GET'
    };

    options.path = options.path.replace(/{ig_user_id}/, userid);

        console.log(options.path);
    var req = https.request(options, function(res) {
        // console.log("statusCode: ", res.statusCode);
        // console.log("headers: ", res.statusCode);

        var result = "";

        res.on('data', function(d) {
            result += d;
        });
        res.on('end', function () {
            if( res.statusCode != "200" ){
                deferred.reject(new Error("Error getting instagram feed. Status code:"+result));
            } else {
                deferred.resolve( JSON.parse(result) );
            }
        });
    });
    req.end();

    req.on('error', function(e) {
        console.error("Get IGRAM error:", e);
        deferred.reject(new Error(error));
    });

    return deferred.promise;

}

function getexisting( userid ) {

    var deferred = Q.defer();

    db.collection.find({ ig_user_id : userid }).sort({ created_time : -1 })
        .toArray(function( err, res ){
            if( err != "null" ){
                deferred.resolve( res );
            } else {
                deferred.reject(new Error(err));
            }
        });

    return deferred.promise;

}

function updatedesigner( designer ){

    var deferred = Q.defer();

    console.log("Get", designer.name);

    db.connect().then(function(){
        console.log("Connected");

        Q.allSettled([
                getexisting(designer.ig_user_id),
                fetchlatest(designer.ig_user_id)
            ])
            .spread(function(existing, fresh){

                return storenew( designer, existing, fresh );

            })
            .then(function( inserted ){
                console.log("Inserted ", inserted, " for ", designer.name);

                deferred.resolve( inserted );

            })
            .fail(function(err){

                console.log(err);

            });

    });

    return deferred.promise;
}

function getnewinstagrams( designers ){

    var deferred = Q.defer(),
        completetotal = 0,
        failedtotal = 0,
        insertstotal = 0;

    for (var i = 0; i < designers.length; i++) {
        console.log("Get new for ", designers[i].name);

        updatedesigner( designers[i] )
            .then(function( insertednum ){

                completetotal++;
                insertstotal += insertednum;
                if( completetotal+failedtotal == designers.length ){
                    deferred.resolve({ insertednum: insertstotal, failednum : failedtotal });
                }

            })
            .fail(function(){

                failedtotal++;
                if( completetotal+failedtotal == designers.length ){
                    deferred.resolve({ insertednum: insertstotal, failednum : failedtotal });
                }

            });
    }

    return deferred.promise;
}


instagram.init = function( app, auth ){

    app.get('/instagram/checknew', auth.ensureAuth, function(req, response){

        config.getdesigners()
            .then(function( designers ){

                getnewinstagrams( designers )
                    .then(function( result ){
                        response.render('checknew', { user: req, inserts : result.insertednum, failed : result.failednum });

                    });
            })
            .fail(function(err){
                console.log("Error getting designers.json", err);

            });

    });

};


/* Currently unused */
function updateInstagramData(){

    var keylist = [
            "location",
            "tags",
            "created_time",
            "link",
            "images",
            "type",
            "id",
            "user",
            "country",
            "caption"
        ],
        updateids = [];

    db.collection.find().sort({ created_time : -1 })
        .toArray(function( err, res ){
            updateids.push(res.id);
        });

    // Clean data of unwanted key:vals.
    while( i-- ){
        for(var key in fresh[i]){
            if( keylist.indexOf( key ) < 0 ){
                delete fresh[i][key]
            }
            // Convert time to integer.
            if( key === "created_time" ){
                fresh[i][key] = Number(fresh[i][key]);
            }
        }
        // Add ig_user_id here to makequerying eaiser.
        for(var key in designer ){
            fresh[i][key] = designer[key];
        }
    }

}

    /*
        igramcollection.update({ ig_user_id : designers[i].ig_user_id },
                    { $set: designers[i] }, { multi : true },
                    function(err, items){
                        console.log("Update designers");
                    });
                    */
